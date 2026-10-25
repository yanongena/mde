import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { slashHandlers, slashKey } from "../editors/slash-menu";
export function SlashMenu({
  editor,
  onImage,
}: {
  editor: Editor;
  onImage(range: { from: number; to: number }): Promise<void>;
}) {
  const [, redraw] = useState(0),
    [index, setIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const state = slashKey.getState(editor.state);
  const commands = [
    {
      label: "Heading 1",
      aliases: "h1 title",
      run: () =>
        editor
          .chain()
          .focus()
          .deleteRange(state!)
          .setHeading({ level: 1 })
          .run(),
    },
    {
      label: "Heading 2",
      aliases: "h2 subtitle",
      run: () =>
        editor
          .chain()
          .focus()
          .deleteRange(state!)
          .setHeading({ level: 2 })
          .run(),
    },
    {
      label: "Heading 3",
      aliases: "h3",
      run: () =>
        editor
          .chain()
          .focus()
          .deleteRange(state!)
          .setHeading({ level: 3 })
          .run(),
    },
    {
      label: "Table",
      aliases: "rows columns",
      run: () =>
        editor
          .chain()
          .focus()
          .deleteRange(state!)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      label: "Checklist",
      aliases: "task todo",
      run: () =>
        editor.chain().focus().deleteRange(state!).toggleTaskList().run(),
    },
    {
      label: "Bullet list",
      aliases: "unordered",
      run: () =>
        editor.chain().focus().deleteRange(state!).toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      aliases: "ordered",
      run: () =>
        editor.chain().focus().deleteRange(state!).toggleOrderedList().run(),
    },
    {
      label: "Image",
      aliases: "picture photo",
      run: () => onImage({ from: state!.from, to: state!.to }),
    },
    {
      label: "Code block",
      aliases: "codeblock programming",
      run: () =>
        editor.chain().focus().deleteRange(state!).setCodeBlock().run(),
    },
    {
      label: "Quote",
      aliases: "blockquote",
      run: () =>
        editor.chain().focus().deleteRange(state!).toggleBlockquote().run(),
    },
    {
      label: "Divider",
      aliases: "horizontal rule",
      run: () =>
        editor.chain().focus().deleteRange(state!).setHorizontalRule().run(),
    },
  ].filter((command) =>
    (command.label + " " + command.aliases)
      .toLowerCase()
      .includes((state?.query || "").toLowerCase()),
  );
  const current = Math.min(index, Math.max(0, commands.length - 1));
  const run = (index: number) => {
    if (!commands[index] || pending.current) return;
    editor.view.dispatch(closeHistory(editor.state.tr));
    const result = commands[index].run();
    if (result instanceof Promise) {
      pending.current = true;
      setBusy(true);
      void result.finally(() => {
        pending.current = false;
        setBusy(false);
      });
    }
  };
  useEffect(() => {
    const refresh = () => redraw((value) => value + 1);
    editor.on("transaction", refresh);
    editor.on("focus", refresh);
    editor.on("blur", refresh);
    return () => {
      editor.off("transaction", refresh);
      editor.off("focus", refresh);
      editor.off("blur", refresh);
    };
  }, [editor]);
  useEffect(() => setIndex(0), [state?.query]);
  useEffect(() => {
    menuRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, state?.query]);
  useEffect(() => {
    slashHandlers.set(editor.view, (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        editor.view.dispatch(
          editor.state.tr.setMeta(slashKey, { dismiss: true }),
        );
        return true;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setIndex(
          (current + (event.key === "ArrowDown" ? 1 : -1) + commands.length) %
            Math.max(1, commands.length),
        );
        return true;
      }
      if (event.key === "Enter" && commands.length) {
        event.preventDefault();
        event.stopPropagation();
        run(current);
        return true;
      }
      return false;
    });
    return () => {
      slashHandlers.delete(editor.view);
    };
  });
  if (!state || state.dismissed || !editor.isFocused) return null;
  const point = editor.view.coordsAtPos(state.to),
    top = Math.max(8, Math.min(point.bottom + 6, window.innerHeight - 310)),
    left = Math.max(8, Math.min(point.left, window.innerWidth - 285));
  return createPortal(
    <div
      className="slash-menu"
      role="listbox"
      ref={menuRef}
      aria-busy={busy}
      aria-label="Insert block"
      style={{ top, left }}
    >
      <div className="slash-caption">INSERT · ↑ ↓ · ENTER</div>
      {commands.map((command, index) => (
        <button
          key={command.label}
          role="option"
          disabled={busy}
          aria-selected={index === current}
          aria-label={`Insert ${command.label.toLowerCase()}`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setIndex(index)}
          onClick={() => run(index)}
        >
          {command.label}
        </button>
      ))}
      {!commands.length && <p>No matching blocks. Escape keeps your text.</p>}
    </div>,
    document.body,
  );
}
