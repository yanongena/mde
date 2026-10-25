import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { visualSearchKey } from "../editors/visual-search";

export function DocumentSearch({
  editor,
  path,
}: {
  editor: Editor;
  path: string;
}) {
  const [open, setOpen] = useState(false),
    [replace, setReplace] = useState(false),
    [replacement, setReplacement] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [, redraw] = useState(0);
  const state = visualSearchKey.getState(editor.state)!;
  const update = (value: Record<string, unknown>) =>
    editor.view.dispatch(editor.state.tr.setMeta(visualSearchKey, value));
  const close = () => {
    setOpen(false);
    update({ query: "" });
    editor.view.focus();
  };
  const navigate = (direction: number) => {
    if (!state.matches.length) return;
    const index =
      (state.index + direction + state.matches.length) % state.matches.length;
    const match = state.matches[index];
    editor.chain().setTextSelection(match).scrollIntoView().run();
    update({ index });
  };
  useEffect(() => {
    const refresh = () => redraw((value) => value + 1);
    editor.on("transaction", refresh);
    const find = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; replace?: boolean }>)
        .detail;
      if (detail.path !== path) return;
      setOpen(true);
      setReplace(!!detail.replace);
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.select();
      });
    };
    window.addEventListener("margin:find", find);
    return () => {
      editor.off("transaction", refresh);
      window.removeEventListener("margin:find", find);
    };
  }, [editor, path]);
  if (!open) return null;
  const replaceMatches = (all: boolean) => {
    const matches = all
      ? state.matches
      : state.matches.slice(state.index, state.index + 1);
    if (!matches.length) return;
    let transaction = closeHistory(editor.state.tr);
    for (const match of [...matches].reverse())
      transaction = transaction.insertText(replacement, match.from, match.to);
    editor.view.dispatch(transaction);
    if (!all) {
      const next = visualSearchKey.getState(editor.state)!;
      const index = Math.max(
        0,
        next.matches.findIndex(
          (match) => match.from >= matches[0].from + replacement.length,
        ),
      );
      update({ index });
      if (next.matches[index])
        editor
          .chain()
          .setTextSelection(next.matches[index])
          .scrollIntoView()
          .run();
    }
  };
  return (
    <div
      className="document-search"
      role="search"
      aria-label="Find in document"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (event.key === "Enter") {
          event.preventDefault();
          navigate(event.shiftKey ? -1 : 1);
        }
      }}
    >
      <div className="document-search-row">
        <input
          ref={input}
          aria-label="Find text"
          placeholder="Find in document…"
          value={state.query}
          onChange={(event) => {
            const query = event.target.value;
            update({ query, index: 0 });
            const match = visualSearchKey.getState(editor.state)?.matches[0];
            if (match)
              editor.chain().setTextSelection(match).scrollIntoView().run();
          }}
        />
        <span role="status">
          {state.matches.length
            ? `${state.index + 1} of ${state.matches.length}${state.matches.length >= 2000 ? "+" : ""}`
            : "No matches"}
        </span>
        <button
          aria-label="Previous match"
          disabled={!state.matches.length}
          onClick={() => navigate(-1)}
        >
          <ChevronUp size={14} />
        </button>
        <button
          aria-label="Next match"
          disabled={!state.matches.length}
          onClick={() => navigate(1)}
        >
          <ChevronDown size={14} />
        </button>
        <button
          aria-label="Toggle replace"
          aria-expanded={replace}
          onClick={() => setReplace(!replace)}
        >
          Replace
        </button>
        <button aria-label="Close document search" onClick={close}>
          <X size={14} />
        </button>
      </div>
      <div className="search-options">
        <label>
          <input
            type="checkbox"
            checked={!!state.caseSensitive}
            onChange={(event) =>
              update({ caseSensitive: event.target.checked, index: 0 })
            }
          />
          Match case
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!state.wholeWord}
            onChange={(event) =>
              update({ wholeWord: event.target.checked, index: 0 })
            }
          />
          Whole word
        </label>
      </div>
      {state.matches.length >= 2000 && (
        <span className="search-summary">
          Showing the first 2000 matches. Refine the query before replacing all.
        </span>
      )}
      {replace && (
        <div className="document-search-row">
          <input
            aria-label="Replace with"
            placeholder="Replace with…"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button
            disabled={!state.matches.length}
            onClick={() => replaceMatches(false)}
          >
            Replace current
          </button>
          <button
            disabled={!state.matches.length || state.matches.length >= 2000}
            onClick={() => replaceMatches(true)}
          >
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}
