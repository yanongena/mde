import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import { common, createLowlight } from "lowlight";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Link,
  ImagePlus,
  Table2,
  Minus,
  Undo2,
  Redo2,
  SquareCode,
  Plus,
  Trash2,
  IndentIncrease,
  IndentDecrease,
} from "lucide-react";
import { assetURL, splitMetadata } from "../lib/markdown";
import type { Attachment } from "../types";

const lowlight = createLowlight(common);
interface Props {
  path: string;
  text: string;
  onChange(text: string): void;
  onError(message: string): void;
  onLink(href: string): void;
}
export function MarkdownEditor({
  path,
  text,
  onChange,
  onError,
  onLink,
}: Props) {
  const callbacks = useRef({ onChange, onError, onLink });
  callbacks.current = { onChange, onError, onLink };
  const original = useRef(splitMetadata(text));
  const lastOutput = useRef(text);
  const [linkDialog, setLinkDialog] = useState(false),
    [linkValue, setLinkValue] = useState("");
  const wasLinkOpen = useRef(false);
  const [, refresh] = useState(0);
  const insertAttachment = async (request: Promise<Attachment | null>) => {
    try {
      const attachment = await request;
      if (attachment && editor && !editor.isDestroyed) {
        editor.commands.setImage({ src: attachment.url, alt: "Image" });
        if (document.activeElement === document.body) editor.view.focus();
      }
    } catch (e) {
      callbacks.current.onError((e as Error).message);
    }
  };
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          codeBlock: false,
          link: {
            openOnClick: false,
            autolink: false,
            linkOnPaste: true,
            protocols: ["https", "http"],
            isAllowedUri: (url) =>
              !/^(?:javascript|data|file|vbscript|command):/i.test(url),
          },
        }),
        Markdown.configure({
          markedOptions: { gfm: true },
          indentation: { style: "space", size: 2 },
        }),
        Image.extend({
          addAttributes() {
            return {
              ...this.parent?.(),
              src: {
                default: null,
                parseHTML: (element) =>
                  element.getAttribute("data-original-src") ||
                  element.getAttribute("src"),
                renderHTML: (attributes) => ({
                  src: assetURL(path, attributes.src || ""),
                  "data-original-src": attributes.src,
                }),
              },
            };
          },
        }).configure({ inline: true, allowBase64: false }),
        TableKit.configure({
          table: { resizable: false, allowTableNodeSelection: true },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        CodeBlockLowlight.configure({ lowlight }),
        Placeholder.configure({ placeholder: "Let your thoughts take shape…" }),
      ],
      content: original.current.body.replace(/\r\n/g, "\n"),
      contentType: "markdown",
      editorProps: {
        attributes: {
          class: "document-content",
          "aria-label": "Visual Markdown editor",
          spellcheck: "true",
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files || []).filter(
            (f) => f.type.startsWith("image/"),
          );
          // Windows exposes a single screenshot in several clipboard image formats.
          // Take its first raster representation once; drop supports multiple files.
          if (files.length) {
            event.preventDefault();
            const file = files[0];
            void insertAttachment(
              file
                .arrayBuffer()
                .then((buffer) =>
                  window.margin.attachment(
                    path,
                    Array.from(new Uint8Array(buffer)),
                    file.name,
                  ),
                ),
            );
            return true;
          }
          return false;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = Array.from(event.dataTransfer?.files || []).filter(
            (f) => f.type.startsWith("image/"),
          );
          if (!files.length || moved) return false;
          event.preventDefault();
          const position = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (position) editor?.commands.setTextSelection(position.pos);
          void (async () => {
            for (const file of files)
              await insertAttachment(
                file
                  .arrayBuffer()
                  .then((buffer) =>
                    window.margin.attachment(
                      path,
                      Array.from(new Uint8Array(buffer)),
                      file.name,
                    ),
                  ),
              );
          })();
          return true;
        },
        handleClick: (_view, _position, event) => {
          const anchor = (event.target as HTMLElement).closest("a");
          if (anchor && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            callbacks.current.onLink(anchor.getAttribute("href") || "");
            return true;
          }
          return false;
        },
        handleKeyDown: (_view, event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "k"
          ) {
            event.preventDefault();
            setLinkValue(editor?.getAttributes("link").href || "");
            setLinkDialog(true);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: updated }) => {
        let markdown = updated.getMarkdown();
        if (original.current.trailing && !markdown.endsWith("\n"))
          markdown += "\n";
        if (original.current.eol === "\r\n")
          markdown = markdown.replace(/\r?\n/g, "\r\n");
        const output = original.current.prefix + markdown;
        lastOutput.current = output;
        callbacks.current.onChange(output);
      },
      onSelectionUpdate: () => refresh((n) => n + 1),
      onTransaction: () => refresh((n) => n + 1),
    },
    [path],
  );
  useEffect(() => {
    if (editor && text !== lastOutput.current) {
      original.current = splitMetadata(text);
      lastOutput.current = text;
      editor.commands.setContent(original.current.body.replace(/\r\n/g, "\n"), {
        contentType: "markdown",
        emitUpdate: false,
      });
    }
  }, [text, editor]);
  useLayoutEffect(() => {
    if (wasLinkOpen.current && !linkDialog) editor?.view.focus();
    wasLinkOpen.current = linkDialog;
  }, [linkDialog, editor]);
  if (!editor) return null;
  const action = (
    label: string,
    icon: React.ReactNode,
    fn: () => unknown,
    active = false,
  ) => (
    <button
      type="button"
      className={"tool-button" + (active ? " selected" : "")}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => { editor.view.focus(); fn(); }}
    >
      {icon}
    </button>
  );
  return (
    <div className="markdown-editor">
      <div
        className="format-toolbar"
        role="toolbar"
        aria-label="Markdown formatting"
      >
        <select
          aria-label="Text style"
          value={
            editor.isActive("heading")
              ? String(editor.getAttributes("heading").level)
              : "0"
          }
          onChange={(e) => {
            editor.view.focus();
            const level = Number(e.target.value);
            if (level)
              editor
                .chain()
                .focus()
                .setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
                .run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="0">Paragraph</option>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <option key={level} value={level}>
              Heading {level}
            </option>
          ))}
        </select>
        <i />
        {action(
          "Bold (Ctrl+B)",
          <Bold />,
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
        )}
        {action(
          "Italic (Ctrl+I)",
          <Italic />,
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
        )}
        {action(
          "Strikethrough",
          <Strikethrough />,
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive("strike"),
        )}
        {action(
          "Inline code",
          <Code />,
          () => editor.chain().focus().toggleCode().run(),
          editor.isActive("code"),
        )}
        <i />
        {action(
          "Bullet list",
          <List />,
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
        )}
        {action(
          "Numbered list",
          <ListOrdered />,
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
        )}
        {action(
          "Checklist",
          <ListChecks />,
          () => editor.chain().focus().toggleTaskList().run(),
          editor.isActive("taskList"),
        )}
        {action(
          "Blockquote",
          <Quote />,
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive("blockquote"),
        )}
        <i />
        {action(
          "Edit link (Ctrl+K)",
          <Link />,
          () => {
            setLinkValue(editor.getAttributes("link").href || "");
            setLinkDialog(true);
          },
          editor.isActive("link"),
        )}
        {action("Insert image", <ImagePlus />, () =>
          insertAttachment(window.margin.selectImage(path)),
        )}
        {action("Insert table", <Table2 />, () =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
        )}
        {action(
          "Code block",
          <SquareCode />,
          () => editor.chain().focus().toggleCodeBlock().run(),
          editor.isActive("codeBlock"),
        )}
        {action("Horizontal rule", <Minus />, () =>
          editor.chain().focus().setHorizontalRule().run(),
        )}
        <span className="toolbar-spacer" />
        {action("Undo", <Undo2 />, () => editor.chain().focus().undo().run())}
        {action("Redo", <Redo2 />, () => editor.chain().focus().redo().run())}
      </div>
      {(editor.isActive("bulletList") ||
        editor.isActive("orderedList") ||
        editor.isActive("taskList")) && (
        <div className="context-toolbar">
          <span>List</span>
          {action(
            "Indent list item",
            <>
              <IndentIncrease /> Indent
            </>,
            () =>
              editor
                .chain()
                .focus()
                .sinkListItem(
                  editor.isActive("taskList") ? "taskItem" : "listItem",
                )
                .run(),
          )}
          {action(
            "Outdent list item",
            <>
              <IndentDecrease /> Outdent
            </>,
            () =>
              editor
                .chain()
                .focus()
                .liftListItem(
                  editor.isActive("taskList") ? "taskItem" : "listItem",
                )
                .run(),
          )}
        </div>
      )}
      {editor.isActive("table") && (
        <div className="context-toolbar">
          <span>Table</span>
          {action(
            "Add row",
            <>
              <Plus /> Row
            </>,
            () => editor.chain().focus().addRowAfter().run(),
          )}
          {action(
            "Add column",
            <>
              <Plus /> Column
            </>,
            () => editor.chain().focus().addColumnAfter().run(),
          )}
          {action("Delete row", <>− Row</>, () =>
            editor.chain().focus().deleteRow().run(),
          )}
          {action("Delete column", <>− Column</>, () =>
            editor.chain().focus().deleteColumn().run(),
          )}
          {action("Delete table", <Trash2 />, () =>
            editor.chain().focus().deleteTable().run(),
          )}
        </div>
      )}
      {editor.isActive("codeBlock") && (
        <div className="context-toolbar">
          <span>Code language</span>
          <input
            aria-label="Code block language"
            placeholder="e.g. python"
            value={editor.getAttributes("codeBlock").language || ""}
            onChange={(e) =>
              editor
                .chain()
                .updateAttributes("codeBlock", {
                  language: e.target.value || null,
                })
                .run()
            }
          />
        </div>
      )}
      {linkDialog && (
        <form
          className="link-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            if (linkValue)
              editor
                .chain()
                .extendMarkRange("link")
                .setLink({ href: linkValue })
                .run();
            else editor.chain().unsetLink().run();
            editor.chain().setTextSelection(editor.state.selection.to).unsetMark("link").run();
            setLinkDialog(false);
          }}
        >
          <Link size={16} />
          <input
            autoFocus
            aria-label="Link destination"
            placeholder="https://… or notes/example.md#heading"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
          />
          <button type="submit" className="primary">
            Apply link
          </button>
          <button type="button" onClick={() => setLinkDialog(false)}>
            Cancel
          </button>
        </form>
      )}
      {original.current.prefix.replace("\uFEFF", "") && (
        <div className="metadata-note">
          Document metadata preserved · edit in Source
        </div>
      )}
      <div className="document-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
