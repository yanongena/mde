import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import {
  EditorState,
  Compartment,
  Transaction,
  Annotation,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  indentWithTab,
  isolateHistory,
  undo,
  redo,
  undoDepth,
  redoDepth,
  selectAll,
  toggleComment,
} from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import {
  openSearchPanel,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import type { Settings, EditorPosition } from "../types";
import { WandSparkles } from "lucide-react";
import { supportsFormatting } from "../lib/formatting";
import { requestFormatting } from "../lib/formatter-client";
import { useContextMenu } from "../components/ContextMenu";
import { editMenuItems, modKey } from "../lib/edit-menu";
import { isMarkdown } from "../lib/markdown";
import { markdownSections, sectionMenuItems } from "../lib/sections";
import {
  registerEditor,
  editorHandle,
  positionChanged,
  textSignature,
} from "../lib/editor-position";

const externalChange = Annotation.define<boolean>();
const editorOffset = (text: string, offset: number) =>
  text.slice(0, offset).replace(/\r\n/g, "\n").length;

interface Props {
  path: string;
  text: string;
  settings: Settings;
  active?: boolean;
  visible?: boolean;
  allowAutoFormat?: boolean;
  onChange(text: string): void;
  onError?(message: string): void;
  position?: EditorPosition;
}
export function CodeEditor({
  path,
  text,
  settings,
  active = true,
  visible = active,
  allowAutoFormat = true,
  onChange,
  onError,
  position,
}: Props) {
  const { openMenu } = useContextMenu();
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    onChangeRef = useRef(onChange);
  const theme = useRef(new Compartment()),
    indentation = useRef(new Compartment());
  // Keep source EOLs outside CodeMirror so pasted LF/CRLF both form real lines.
  // Internal positions count LF; formatter/outline positions count source EOLs.
  const lineBreak = useRef(text.includes("\r\n") ? "\r\n" : "\n");
  const sourceText = (state: EditorState, from = 0, to = state.doc.length) =>
    state.doc.sliceString(from, to, lineBreak.current);
  onChangeRef.current = onChange;
  const optionsRef = useRef({ settings, active, allowAutoFormat, onError });
  optionsRef.current = { settings, active, allowAutoFormat, onError };
  const attempted = useRef(false),
    formatting = useRef(false);
  const restoredPosition = useRef(false);
  const [formatStatus, setFormatStatus] = useState(""),
    [isFormatting, setIsFormatting] = useState(false);
  const formatRef = useRef<(automatic?: boolean) => Promise<void>>(
    async () => {},
  );
  formatRef.current = async (automatic = false) => {
    const current = view.current;
    if (!current || formatting.current || !supportsFormatting(path)) return;
    const before = current.state.doc,
      beforeLineBreak = lineBreak.current,
      selection = current.state.selection;
    formatting.current = true;
    setIsFormatting(true);
    setFormatStatus("");
    try {
      const result = await requestFormatting({
        path,
        text: sourceText(current.state),
        indentSize: optionsRef.current.settings.indentSize,
        cursorOffset: sourceText(current.state, 0, selection.main.head).length,
      });
      // Never replace typing, an external reload or an undo that happened while
      // the worker was parsing; cancelled automatic work stays cancelled.
      if (
        current !== view.current ||
        lineBreak.current !== beforeLineBreak ||
        current.state.doc !== before ||
        (automatic &&
          (!optionsRef.current.active ||
            !optionsRef.current.settings.formatOnOpen ||
            !optionsRef.current.allowAutoFormat ||
            !selection.eq(current.state.selection)))
      )
        return;
      if (result.formatted !== sourceText(current.state)) {
        current.dispatch({
          changes: { from: 0, to: before.length, insert: result.formatted },
          ...(selection.eq(current.state.selection)
            ? {
                selection: {
                  anchor: editorOffset(result.formatted, result.cursorOffset),
                },
              }
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
          EditorView.domEventHandlers({
            contextmenu: (event, current) => {
              event.preventDefault();
              const position = current.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              });
              if (
                event.button === 2 &&
                position !== null &&
                !current.state.selection.ranges.some(
                  (range) =>
                    !range.empty &&
                    position >= range.from &&
                    position <= range.to,
                )
              )
                current.dispatch({ selection: { anchor: position } });
              const selected = sourceText(
                current.state,
                current.state.selection.main.from,
                current.state.selection.main.to,
              );
              const clickedPosition =
                event.button === 2
                  ? position
                  : current.state.selection.main.head;
              const clicked =
                clickedPosition === null
                  ? null
                  : sourceText(current.state, 0, clickedPosition).length;
              const section =
                isMarkdown(path) && clicked !== null
                  ? markdownSections(sourceText(current.state)).find(
                      (heading) =>
                        clicked >= heading.from && clicked <= heading.to,
                    )
                  : undefined;
              const search = (replace = false) => {
                openSearchPanel(current);
                current.dom
                  .querySelector<HTMLInputElement>(
                    replace ? '[name="replace"]' : '[name="search"]',
                  )
                  ?.focus();
              };
              openMenu({
                x: event.clientX,
                y: event.clientY,
                restoreFocus: () => {
                  if (current.dom.isConnected) current.focus();
                },
                items: [
                  ...editMenuItems({
                    selected: current.state.selection.ranges.some(
                      (range) => !range.empty,
                    ),
                    canUndo: undoDepth(current.state) > 0,
                    canRedo: redoDepth(current.state) > 0,
                    undo: () => undo(current),
                    redo: () => redo(current),
                    selectAll: () => selectAll(current),
                  }),
                  ...(section
                    ? [null, ...sectionMenuItems(path, section)]
                    : []),
                  null,
                  {
                    label: "Find",
                    shortcut: `${modKey}+F`,
                    run: () => search(),
                  },
                  {
                    label: "Replace",
                    shortcut: `${modKey}+H`,
                    run: () => search(true),
                  },
                  {
                    label: "Find selection",
                    disabled: !selected,
                    run: () => {
                      current.dispatch({
                        effects: setSearchQuery.of(
                          new SearchQuery({ search: selected, literal: true }),
                        ),
                      });
                      search();
                    },
                  },
                  null,
                  {
                    label: "Toggle comment",
                    shortcut: `${modKey}+/`,
                    disabled: !current.state.languageDataAt(
                      "commentTokens",
                      current.state.selection.main.head,
                    ).length,
                    run: () => toggleComment(current),
                  },
                  {
                    label: "Format document",
                    shortcut: "Shift+Alt+F",
                    disabled: !supportsFormatting(path) || formatting.current,
                    run: () => formatRef.current(),
                  },
                ],
              });
              return true;
            },
          }),
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
            if (
              update.selectionSet ||
              update.docChanged ||
              update.viewportChanged
            )
              positionChanged(path);
            if (
              update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(externalChange),
              )
            ) {
              if (
                !update.transactions.some((transaction) =>
                  transaction.isUserEvent("input.format"),
                )
              )
                setFormatStatus("");
              onChangeRef.current(sourceText(update.state));
            }
          }),
        ],
      }),
    });
    view.current = current;
    const unregister = registerEditor(path, "source", {
      focus: () => current.focus(),
      selectionVisible: () => {
        const point = current.coordsAtPos(current.state.selection.main.head),
          rect = current.scrollDOM.getBoundingClientRect();
        return !!point && point.top >= rect.top && point.bottom <= rect.bottom;
      },
      capture: () => {
        const scroll = current.scrollDOM,
          rect = scroll.getBoundingClientRect();
        const top =
          current.posAtCoords(
            {
              x: Math.max(
                rect.left + 6,
                current.contentDOM.getBoundingClientRect().left + 4,
              ),
              y: rect.top + 4,
            },
            false,
          ) ?? 0;
        const selection = current.state.selection.main;
        return {
          mode: "source",
          anchor: selection.anchor,
          head: selection.head,
          sourceAnchor: sourceText(current.state, 0, selection.anchor).length,
          sourceHead: sourceText(current.state, 0, selection.head).length,
          scrollTop: scroll.scrollTop,
          topSource: sourceText(current.state, 0, top).length,
          topOffset: (current.coordsAtPos(top)?.top ?? rect.top) - rect.top,
          scrollRatio:
            scroll.scrollTop /
            Math.max(1, scroll.scrollHeight - scroll.clientHeight),
          signature: textSignature(sourceText(current.state)),
        };
      },
      restore: (saved, focus = true) => {
        restoredPosition.current = true;
        const raw = sourceText(current.state);
        const exact =
          saved.mode === "source" && saved.signature === textSignature(raw);
        const anchor = Math.min(
          current.state.doc.length,
          exact ? saved.anchor : editorOffset(raw, saved.sourceAnchor),
        );
        const head = Math.min(
          current.state.doc.length,
          exact ? saved.head : editorOffset(raw, saved.sourceHead),
        );
        const top = Math.min(
          current.state.doc.length,
          editorOffset(raw, saved.topSource),
        );
        current.dispatch({
          selection: { anchor, head },
          ...(!exact
            ? { effects: EditorView.scrollIntoView(top, { y: "start" }) }
            : {}),
        });
        requestAnimationFrame(() => {
          if (!current.dom.isConnected) return;
          if (exact) current.scrollDOM.scrollTop = saved.scrollTop;
          else {
            const coords = current.coordsAtPos(top);
            if (coords)
              current.scrollDOM.scrollTop +=
                coords.top -
                current.scrollDOM.getBoundingClientRect().top -
                saved.topOffset;
          }
          if (focus) current.focus();
        });
      },
      reveal: (from, to = from) => {
        restoredPosition.current = true;
        const raw = sourceText(current.state),
          anchor = Math.min(current.state.doc.length, editorOffset(raw, from)),
          head = Math.min(current.state.doc.length, editorOffset(raw, to));
        current.dispatch({
          selection: { anchor, head },
          effects: EditorView.scrollIntoView(anchor, { y: "center" }),
        });
        current.focus();
      },
    });
    const scrolled = () => positionChanged(path, "scroll");
    current.scrollDOM.addEventListener("scroll", scrolled, { passive: true });
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
      const detail = (
        event as CustomEvent<{ path: string; line: number; offset?: number }>
      ).detail;
      if (detail.path !== path) return;
      const line = current.state.doc.line(
        Math.max(1, Math.min(detail.line, current.state.doc.lines)),
      );
      const anchor =
        detail.offset === undefined
          ? line.from
          : Math.max(
              0,
              Math.min(
                editorOffset(sourceText(current.state), detail.offset),
                current.state.doc.length,
              ),
            );
      current.dispatch({
        selection: { anchor },
        effects: EditorView.scrollIntoView(anchor, { y: "start" }),
      });
      current.focus();
    };
    window.addEventListener("margin:goto-line", goto);
    const format = (event: Event) => {
      if ((event as CustomEvent<{ path: string }>).detail.path === path)
        void formatRef.current();
    };
    window.addEventListener("margin:format-document", format);
    const find = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; replace?: boolean }>)
        .detail;
      if (detail.path !== path) return;
      openSearchPanel(current);
      current.dom
        .querySelector<HTMLInputElement>(
          detail.replace ? '[name="replace"]' : '[name="search"]',
        )
        ?.focus();
    };
    window.addEventListener("margin:find", find);
    return () => {
      cancelled = true;
      window.removeEventListener("margin:goto-line", goto);
      window.removeEventListener("margin:format-document", format);
      window.removeEventListener("margin:find", find);
      current.scrollDOM.removeEventListener("scroll", scrolled);
      unregister();
      current.destroy();
      view.current = null;
    };
  }, [path]);
  useEffect(() => {
    if (!visible || restoredPosition.current) return;
    restoredPosition.current = true;
    if (!position) return;
    requestAnimationFrame(() => {
      if (view.current?.dom.isConnected)
        editorHandle(path, "source")?.restore(position, active);
    });
  }, [active, visible, position, path]);
  useEffect(() => {
    const current = view.current;
    if (text.includes("\n"))
      lineBreak.current = text.includes("\r\n") ? "\r\n" : "\n";
    if (current && current.state.doc.toString() !== text.replace(/\r\n/g, "\n"))
      current.dispatch({
        changes: { from: 0, to: current.state.doc.length, insert: text },
        annotations: externalChange.of(true),
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
            data-tooltip="Format document (Shift+Alt+F)"
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
