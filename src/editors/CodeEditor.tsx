import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState, Compartment, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab, isolateHistory } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { openSearchPanel } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import type { Settings } from "../types";
import { WandSparkles } from "lucide-react";
import { supportsFormatting } from "../lib/formatting";
import { requestFormatting } from "../lib/formatter-client";

interface Props {
  path: string;
  text: string;
  settings: Settings;
  active?: boolean;
  allowAutoFormat?: boolean;
  onChange(text: string): void;
  onError?(message: string): void;
}
export function CodeEditor({
  path,
  text,
  settings,
  active = true,
  allowAutoFormat = true,
  onChange,
  onError,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    onChangeRef = useRef(onChange);
  const theme = useRef(new Compartment()),
    indentation = useRef(new Compartment());
  onChangeRef.current = onChange;
  const optionsRef = useRef({ settings, active, allowAutoFormat, onError });
  optionsRef.current = { settings, active, allowAutoFormat, onError };
  const attempted = useRef(false),
    formatting = useRef(false);
  const [formatStatus, setFormatStatus] = useState(""),
    [isFormatting, setIsFormatting] = useState(false);
  const formatRef = useRef<(automatic?: boolean) => Promise<void>>(
    async () => {},
  );
  formatRef.current = async (automatic = false) => {
    const current = view.current;
    if (!current || formatting.current || !supportsFormatting(path)) return;
    const before = current.state.doc,
      selection = current.state.selection;
    formatting.current = true;
    setIsFormatting(true);
    setFormatStatus("");
    try {
      const result = await requestFormatting({
        path,
        text: before.toString(),
        indentSize: optionsRef.current.settings.indentSize,
        cursorOffset: selection.main.head,
      });
      // Never replace typing, an external reload or an undo that happened while
      // the worker was parsing; cancelled automatic work stays cancelled.
      if (
        current !== view.current ||
        current.state.doc !== before ||
        (automatic &&
          (!optionsRef.current.active ||
            !optionsRef.current.settings.formatOnOpen))
      )
        return;
      if (result.formatted !== before.toString()) {
        current.dispatch({
          changes: { from: 0, to: before.length, insert: result.formatted },
          ...(selection.eq(current.state.selection)
            ? { selection: { anchor: result.cursorOffset } }
            : {}),
          annotations: [
            Transaction.userEvent.of("input.format"),
            isolateHistory.of("full"),
          ],
        });
        setFormatStatus(
          automatic
            ? "Automatically formatted · Undo to restore"
            : "Formatted · Undo to restore",
        );
      } else setFormatStatus("Already formatted");
    } catch (error) {
      if (current !== view.current || current.state.doc !== before) return;
      setFormatStatus("Original formatting retained");
      if (!automatic) optionsRef.current.onError?.((error as Error).message);
    } finally {
      formatting.current = false;
      if (current === view.current) setIsFormatting(false);
    }
  };
  useEffect(() => {
    if (!host.current) return;
    let cancelled = false;
    const language = new Compartment();
    const current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          basicSetup,
          keymap.of([
            indentWithTab,
            { key: "Mod-h", run: openSearchPanel },
            {
              key: "Shift-Alt-f",
              run: () => {
                void formatRef.current();
                return true;
              },
            },
          ]),
          EditorView.lineWrapping,
          language.of([]),
          theme.current.of(settings.theme === "dark" ? oneDark : []),
          indentation.current.of([
            indentUnit.of(" ".repeat(settings.indentSize)),
            EditorState.tabSize.of(settings.indentSize),
          ]),
          EditorView.contentAttributes.of({
            "aria-label": "Source editor",
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              if (
                !update.transactions.some((transaction) =>
                  transaction.isUserEvent("input.format"),
                )
              )
                setFormatStatus("");
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    view.current = current;
    const filename = path.split("/").pop() || "";
    const description =
      languages.find((l) => l.filename?.test(filename)) ||
      languages.find((l) =>
        l.extensions.includes(filename.split(".").pop() || ""),
      );
    description
      ?.load()
      .then((support) => {
        if (!cancelled)
          current.dispatch({
            effects: language.reconfigure([
              support,
              ...(filename.endsWith(".json")
                ? [linter(jsonParseLinter()), lintGutter()]
                : []),
            ]),
          });
      })
      .catch(console.error);
    const goto = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; line: number }>)
        .detail;
      if (detail.path !== path) return;
      const line = current.state.doc.line(
        Math.max(1, Math.min(detail.line, current.state.doc.lines)),
      );
      current.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "start" }),
      });
      current.focus();
    };
    window.addEventListener("margin:goto-line", goto);
    const format = (event: Event) => {
      if ((event as CustomEvent<{ path: string }>).detail.path === path)
        void formatRef.current();
    };
    window.addEventListener("margin:format-document", format);
    return () => {
      cancelled = true;
      window.removeEventListener("margin:goto-line", goto);
      window.removeEventListener("margin:format-document", format);
      current.destroy();
      view.current = null;
    };
  }, [path]);
  useEffect(() => {
    const current = view.current;
    if (current && current.state.doc.toString() !== text)
      current.dispatch({
        changes: { from: 0, to: current.state.doc.length, insert: text },
      });
  }, [text]);
  useEffect(() => {
    view.current?.dispatch({
      effects: [
        theme.current.reconfigure(settings.theme === "dark" ? oneDark : []),
        indentation.current.reconfigure([
          indentUnit.of(" ".repeat(settings.indentSize)),
          EditorState.tabSize.of(settings.indentSize),
        ]),
      ],
    });
  }, [settings.theme, settings.indentSize]);
  useEffect(() => {
    if (!settings.formatOnOpen) {
      attempted.current = false;
      return;
    }
    if (!active || attempted.current) return;
    attempted.current = true;
    if (allowAutoFormat) void formatRef.current(true);
  }, [active, settings.formatOnOpen]);
  return (
    <div className="code-editor-container">
      {supportsFormatting(path) && (
        <div className="code-format-toolbar">
          <span role="status">
            {isFormatting ? "Formatting…" : formatStatus}
          </span>
          <button
            type="button"
            disabled={isFormatting}
            aria-label="Format document"
            title="Format document (Shift+Alt+F)"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              view.current?.focus();
              void formatRef.current();
            }}
          >
            <WandSparkles size={13} />
            Format document<kbd>⇧ Alt F</kbd>
          </button>
        </div>
      )}
      <div
        className="code-editor"
        data-testid="code-editor"
        ref={host}
        style={{ fontSize: settings.fontSize }}
      />
    </div>
  );
}
