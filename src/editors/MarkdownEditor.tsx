import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection, NodeSelection } from "@tiptap/pm/state";
import { ImagePreview } from "../components/ImagePreview";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
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
  X,
  Search,
} from "lucide-react";
import { assetURL, splitMetadata, resolveLink } from "../lib/markdown";
import type {
  Attachment,
  EditorPosition,
  Entry,
  Tab,
  SpellcheckInfo,
} from "../types";
import { Spellcheck, spellcheckKey } from "./spellcheck";
import { SlashMenuExtension } from "./slash-menu";
import { SlashMenu } from "../components/SlashMenu";
import { VisualSearch } from "./visual-search";
import { LinkPicker } from "../components/LinkPicker";
import { DocumentSearch } from "../components/DocumentSearch";
import {
  registerEditor,
  editorHandle,
  positionChanged,
  textSignature,
  visualToSource,
  sourceToVisual,
} from "../lib/editor-position";
import { useContextMenu, type MenuItem } from "../components/ContextMenu";
import { editMenuItems, modKey } from "../lib/edit-menu";
import { copyImage } from "../lib/image-clipboard";
import {
  installMarkdownFileDrop,
  dropWord,
  linkDropSpacing,
} from "../lib/markdown-file-drop";
import {
  headingSections,
  sectionMenuItems,
  sectionTitle,
} from "../lib/sections";

const lowlight = createLowlight(common);
interface Props {
  path: string;
  text: string;
  onChange(text: string): void;
  onError(message: string): void;
  onLink(href: string): void;
  active?: boolean;
  visible?: boolean;
  position?: EditorPosition;
  entries?: Entry[];
  tabs?: Tab[];
  spellcheck: SpellcheckInfo | null;
}
export function MarkdownEditor({
  path,
  text,
  onChange,
  onError,
  onLink,
  active = true,
  visible = active,
  position,
  entries = [],
  tabs = [],
  spellcheck,
}: Props) {
  const spelling = useRef({ info: spellcheck, visible });
  spelling.current = { info: spellcheck, visible };
  const { openMenu } = useContextMenu();
  const callbacks = useRef({ onChange, onError, onLink });
  callbacks.current = { onChange, onError, onLink };
  const original = useRef(splitMetadata(text));
  const lastOutput = useRef(text);
  const [linkDialog, setLinkDialog] = useState(false),
    [linkValue, setLinkValue] = useState("");
  const [pickLink, setPickLink] = useState(false);
  const linkSelection = useRef<{ from: number; to: number } | null>(null);
  const wasLinkOpen = useRef(false);
  const [imageAlt, setImageAlt] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const textRef = useRef(text);
  textRef.current = text;
  const restoredPosition = useRef(false);
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
        VisualSearch,
        Spellcheck.configure({
          info: () => spelling.current.info,
          visible: () => spelling.current.visible,
          onError: (message) => callbacks.current.onError(message),
        }),
        SlashMenuExtension,
        StarterKit.configure({
          codeBlock: false,
          paragraph: false,
          link: {
            openOnClick: false,
            autolink: false,
            linkOnPaste: true,
            protocols: ["https", "http"],
            isAllowedUri: (url) =>
              !/^(?:javascript|data|file|vbscript|command):/i.test(url),
          },
        }),
        Paragraph.extend({
          parseMarkdown(token, helpers) {
            // The default parser promotes an image-only paragraph to a block
            // image. Our images are inline, so retain their paragraph wrapper.
            if (token.tokens?.length === 1 && token.tokens[0].type === "image")
              return helpers.createNode(
                "paragraph",
                undefined,
                helpers.parseInline(token.tokens),
              );
            return (
              this.parent?.(token, helpers) ||
              helpers.createNode(
                "paragraph",
                undefined,
                helpers.parseInline(token.tokens || []),
              )
            );
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
          // Native markers are maintained incrementally by Chromium and can be
          // stale. The spelling plugin checks every occurrence in the document.
          spellcheck: "false",
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
            setLinkValue(
              _view.state.selection.$from
                .marks()
                .find((mark) => mark.type.name === "link")?.attrs.href || "",
            );
            const selected = _view.dom.ownerDocument.getSelection();
            if (
              selected &&
              !selected.isCollapsed &&
              selected.anchorNode &&
              selected.focusNode &&
              _view.dom.contains(selected.anchorNode) &&
              _view.dom.contains(selected.focusNode)
            ) {
              const anchor = _view.posAtDOM(
                  selected.anchorNode,
                  selected.anchorOffset,
                ),
                head = _view.posAtDOM(selected.focusNode, selected.focusOffset);
              _view.dispatch(
                _view.state.tr.setSelection(
                  TextSelection.between(
                    _view.state.doc.resolve(anchor),
                    _view.state.doc.resolve(head),
                  ),
                ),
              );
            }

            linkSelection.current = {
              from: _view.state.selection.from,
              to: _view.state.selection.to,
            };
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
      onSelectionUpdate: () => {
        refresh((n) => n + 1);
        positionChanged(path);
      },
      onTransaction: () => refresh((n) => n + 1),
    },
    [path],
  );
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.lang = spellcheck?.language || "";
    editor.view.dispatch(
      editor.state.tr
        .setMeta(spellcheckKey, "refresh")
        .setMeta("addToHistory", false),
    );
  }, [editor, spellcheck, visible]);
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
  useEffect(() => {
    if (!editor) return;
    const view = editor.view;
    return installMarkdownFileDrop({
      path,
      surface: view.dom.closest<HTMLElement>(".document-scroll")!,
      position(x, y) {
        const position = view.posAtCoords({ left: x, top: y });
        if (!position) return null;
        const pos = Math.max(
          1,
          Math.min(view.state.doc.content.size - 1, position.pos),
        );
        const resolved = view.state.doc.resolve(pos);
        return resolved.parent.isTextblock &&
          resolved.parent.type.name !== "codeBlock" &&
          !resolved.marks().some((mark) => mark.type.name === "code")
          ? pos
          : null;
      },
      word(pos) {
        const resolved = view.state.doc.resolve(pos);
        const text = resolved.parent.textBetween(
          0,
          resolved.parent.content.size,
          "\0",
          "\0",
        );
        const word = dropWord(text, resolved.parentOffset);
        if (!word) return null;
        const from = resolved.start() + word.from,
          to = resolved.start() + word.to;
        let code = false;
        view.state.doc.nodesBetween(from, to, (node) => {
          if (node.marks.some((mark) => mark.type.name === "code")) code = true;
        });
        return code ? null : { from, to };
      },
      text: ({ from, to }) => view.state.doc.textBetween(from, to),
      dom: (pos) => view.domAtPos(pos),
      caret: (pos) => view.coordsAtPos(pos),
      insert({ from, to }, label, href) {
        const state = view.state,
          link = state.schema.marks.link.create({ href });
        const marks = state.doc
          .resolve(from)
          .marks()
          .filter((mark) => mark.type.name !== "link");
        let transaction = closeHistory(state.tr);
        let start = from,
          end = to;
        if (from === to) {
          const resolved = state.doc.resolve(from),
            offset = resolved.parentOffset;
          const text = resolved.parent.textBetween(
            0,
            resolved.parent.content.size,
            "\0",
            "\0",
          );
          const padding = linkDropSpacing(
            text[offset - 1] || "",
            text[offset] || "",
          );
          transaction = transaction.insert(
            from,
            state.schema.text(padding.before + label + padding.after, marks),
          );
          start += padding.before.length;
          end = start + label.length;
        }
        transaction
          .addMark(start, end, link)
          .setSelection(TextSelection.create(transaction.doc, end))
          .setStoredMarks(marks);
        view.dispatch(transaction.scrollIntoView());
        view.dispatch(
          closeHistory(view.state.tr)
            .setMeta("addToHistory", false)
            .setMeta("skipTrailingNode", true),
        );
        view.focus();
      },
    });
  }, [editor, path]);
  useEffect(() => {
    if (!editor) return;
    const scroll = editor.view.dom.closest(".document-scroll") as HTMLElement;
    const scrolled = () => positionChanged(path, "scroll");
    scroll.addEventListener("scroll", scrolled, { passive: true });
    const unregister = registerEditor(path, "visual", {
      focus: () => editor.view.focus(),
      selectionVisible: () => {
        const point = editor.view.coordsAtPos(editor.state.selection.head),
          rect = scroll.getBoundingClientRect();
        return point.top >= rect.top && point.bottom <= rect.bottom;
      },
      capture: () => {
        const rect = scroll.getBoundingClientRect(),
          content = editor.view.dom.getBoundingClientRect();
        const top =
          editor.view.posAtCoords({
            left: Math.max(rect.left + 8, content.left + 60),
            top: rect.top + 6,
          })?.pos ?? 1;
        const selection = editor.state.selection;
        return {
          mode: "visual",
          anchor: selection.anchor,
          head: selection.head,
          sourceAnchor: visualToSource(
            textRef.current,
            editor.state.doc,
            selection.anchor,
            selection.anchor > selection.head,
          ),
          sourceHead: visualToSource(
            textRef.current,
            editor.state.doc,
            selection.head,
            selection.head > selection.anchor,
          ),
          scrollTop: scroll.scrollTop,
          topSource: visualToSource(textRef.current, editor.state.doc, top),
          topOffset: editor.view.coordsAtPos(top).top - rect.top,
          scrollRatio:
            scroll.scrollTop /
            Math.max(1, scroll.scrollHeight - scroll.clientHeight),
          signature: textSignature(textRef.current),
        };
      },
      restore: (saved, focus = true) => {
        restoredPosition.current = true;
        const raw = textRef.current,
          exact =
            saved.mode === "visual" && saved.signature === textSignature(raw);
        const clamp = (value: number) =>
          Math.max(1, Math.min(editor.state.doc.content.size - 1, value));
        const from = clamp(
          exact
            ? saved.anchor
            : sourceToVisual(raw, editor.state.doc, saved.sourceAnchor),
        );
        const to = clamp(
          exact
            ? saved.head
            : sourceToVisual(raw, editor.state.doc, saved.sourceHead),
        );
        editor.commands.setTextSelection({ from, to });
        requestAnimationFrame(() => {
          if (editor.isDestroyed) return;
          if (exact) scroll.scrollTop = saved.scrollTop;
          else {
            const top = clamp(
              sourceToVisual(raw, editor.state.doc, saved.topSource),
            );
            scroll.scrollTop +=
              editor.view.coordsAtPos(top).top -
              scroll.getBoundingClientRect().top -
              saved.topOffset;
          }
          if (focus) editor.view.focus();
        });
      },
      reveal: (from, to = from) => {
        restoredPosition.current = true;
        const raw = textRef.current;
        editor
          .chain()
          .setTextSelection({
            from: sourceToVisual(raw, editor.state.doc, from),
            to: sourceToVisual(raw, editor.state.doc, to),
          })
          .scrollIntoView()
          .run();
        editor.view.focus();
        requestAnimationFrame(() => {
          if (editor.isDestroyed) return;
          const point = editor.view.coordsAtPos(
            sourceToVisual(textRef.current, editor.state.doc, from),
          );
          scroll.scrollTop +=
            point.top - scroll.getBoundingClientRect().top - 16;
        });
      },
    });
    return () => {
      scroll.removeEventListener("scroll", scrolled);
      unregister();
    };
  }, [editor, path]);
  useEffect(() => {
    if (!editor || !visible || restoredPosition.current) return;
    restoredPosition.current = true;
    if (!position) return;
    requestAnimationFrame(() =>
      editorHandle(path, "visual")?.restore(position, active),
    );
  }, [editor, path, active, visible, position]);
  if (!editor) return null;
  const slashMenu = (
    <SlashMenu
      editor={editor}
      onImage={(range) => {
        const documentBefore = editor.state.doc;
        return window.margin
          .selectImage(path)
          .then((attachment) => {
            if (!attachment || editor.isDestroyed) return;
            if (!editor.state.doc.eq(documentBefore)) {
              callbacks.current.onError(
                "The document changed while choosing an image. Its saved attachment is available in the explorer.",
              );
              return;
            }
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .setImage({ src: attachment.url, alt: "Image" })
              .run();
          })
          .catch((error) => callbacks.current.onError(error.message));
      }}
    />
  );
  const action = (
    label: string,
    icon: React.ReactNode,
    fn: () => unknown,
    active = false,
  ) => (
    <button
      type="button"
      className={"tool-button" + (active ? " selected" : "")}
      data-tooltip={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        editor.view.focus();
        fn();
      }}
    >
      {icon}
    </button>
  );
  return (
    <div className="markdown-editor">
      {slashMenu}
      <DocumentSearch editor={editor} path={path} />
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
            if (editor)
              linkSelection.current = {
                from: editor.state.selection.from,
                to: editor.state.selection.to,
              };
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
        {action("Find in document", <Search />, () =>
          window.dispatchEvent(
            new CustomEvent("margin:find", { detail: { path } }),
          ),
        )}
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
                .setTextSelection(
                  linkSelection.current || editor.state.selection,
                )
                .extendMarkRange("link")
                .setLink({ href: linkValue })
                .run();
            else
              editor
                .chain()
                .setTextSelection(
                  linkSelection.current || editor.state.selection,
                )
                .unsetLink()
                .run();
            editor
              .chain()
              .setTextSelection(editor.state.selection.to)
              .unsetMark("link")
              .run();
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
          <button
            type="button"
            aria-expanded={pickLink}
            onClick={() => setPickLink(!pickLink)}
          >
            Choose file or section
          </button>
          <button type="submit" className="primary">
            Apply link
          </button>
          <button type="button" onClick={() => setLinkDialog(false)}>
            Cancel
          </button>
          {pickLink && (
            <LinkPicker entries={entries} tabs={tabs} onChoose={setLinkValue} />
          )}
        </form>
      )}
      {original.current.prefix.replace("\uFEFF", "") && (
        <div className="metadata-note">
          Document metadata preserved · edit in Source
        </div>
      )}
      {imageAlt !== null && (
        <form
          className="link-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (editor.isActive("image"))
              editor
                .chain()
                .focus()
                .updateAttributes("image", { alt: imageAlt })
                .run();
            setImageAlt(null);
          }}
        >
          <input
            autoFocus
            aria-label="Image alternative text"
            value={imageAlt}
            onChange={(event) => setImageAlt(event.target.value)}
          />
          <button type="submit" className="primary">
            Apply alternative text
          </button>
          <button
            type="button"
            onClick={() => {
              setImageAlt(null);
              editor.view.focus();
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {imagePreview && (
        <div
          className="modal-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setImagePreview(null);
              editor.view.focus();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setImagePreview(null);
              editor.view.focus();
            }
          }}
        >
          <div
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
          >
            <button
              autoFocus
              aria-label="Close image preview"
              onClick={() => {
                setImagePreview(null);
                editor.view.focus();
              }}
            >
              <X size={16} />
            </button>
            <ImagePreview
              path={imagePreview}
              source={imagePreview}
              localPath={null}
            />
          </div>
        </div>
      )}
      <div
        className="document-scroll"
        onContextMenu={(event) => {
          let target = event.target as HTMLElement;
          if (
            event.button !== 2 &&
            editor.state.selection instanceof NodeSelection
          ) {
            const node = editor.view.nodeDOM(editor.state.selection.from);
            if (node instanceof HTMLElement) target = node;
          }
          if (!target.closest(".document-content")) return;
          event.preventDefault();
          const position = editor.view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          const selection = editor.state.selection;
          if (
            event.button === 2 &&
            position &&
            (selection.empty ||
              position.pos < selection.from ||
              position.pos > selection.to)
          )
            editor.commands.setTextSelection(position.pos);
          const items: MenuItem[] = editMenuItems({
            selected: !editor.state.selection.empty,
            canUndo: editor.can().undo(),
            canRedo: editor.can().redo(),
            undo: () => editor.commands.undo(),
            redo: () => editor.commands.redo(),
            selectAll: () => editor.commands.selectAll(),
          });
          const editChain = () => {
            editor.view.dispatch(closeHistory(editor.state.tr));
            return editor.chain();
          };
          const heading = target.closest("h1,h2,h3,h4,h5,h6");
          if (heading) {
            const sections: Parameters<typeof headingSections>[0] = [];
            editor.state.doc.descendants((node, from) => {
              if (node.type.name === "heading")
                sections.push({
                  title: sectionTitle(
                    node.textBetween(0, node.content.size, " ", (leaf) =>
                      leaf.type.name === "image"
                        ? String(leaf.attrs.alt || "")
                        : " ",
                    ),
                  ),
                  from,
                  to: from + node.nodeSize,
                  level: node.attrs.level,
                });
            });
            const position = editor.view.posAtDOM(heading, 0);
            const section = headingSections(sections).find(
              (item) => position > item.from && position < item.to,
            );
            if (section) items.push(null, ...sectionMenuItems(path, section));
          }
          if (
            editor.state.selection instanceof TextSelection &&
            !editor.state.selection.empty
          ) {
            items.push(null, {
              label: "Format",
              children: [
                {
                  label: "Bold",
                  shortcut: `${modKey}+B`,
                  run: () => editChain().toggleBold().run(),
                },
                {
                  label: "Italic",
                  shortcut: `${modKey}+I`,
                  run: () => editChain().toggleItalic().run(),
                },
                {
                  label: "Strikethrough",
                  run: () => editChain().toggleStrike().run(),
                },
                {
                  label: "Inline code",
                  run: () => editChain().toggleCode().run(),
                },
                {
                  label: "Add link",
                  shortcut: `${modKey}+K`,
                  run: () => {
                    setLinkValue(editor.getAttributes("link").href || "");
                    if (editor)
                      linkSelection.current = {
                        from: editor.state.selection.from,
                        to: editor.state.selection.to,
                      };
                    setLinkDialog(true);
                  },
                },
                {
                  label: "Clear formatting",
                  run: () => editChain().unsetAllMarks().run(),
                },
              ],
            });
          }
          const image = target.closest("img");
          if (image) {
            const from = editor.view.posAtDOM(image, 0);
            const node = editor.state.doc.nodeAt(from);
            if (node?.type.name === "image") {
              const src = String(node.attrs.src || "");
              const url = assetURL(path, src);
              items.push(
                null,
                {
                  label: "Open in image viewer",
                  disabled: !url,
                  run: () => {
                    const link = resolveLink(path, src);
                    if (link.external) setImagePreview(url);
                    else callbacks.current.onLink(src);
                  },
                },
                {
                  label: "Copy image",
                  disabled: !url,
                  run: () => copyImage(url),
                },
                {
                  label: "Copy image address",
                  run: () => window.margin.copyText(src),
                },
                {
                  label: "Edit alternative text",
                  run: () => {
                    editor.commands.setNodeSelection(from);
                    setImageAlt(String(node.attrs.alt || ""));
                  },
                },
                {
                  label: "Remove image from document",
                  danger: true,
                  run: () =>
                    editChain().setNodeSelection(from).deleteSelection().run(),
                },
              );
            }
          }
          const findNode = (element: HTMLElement, names: string[]) => {
            const position = editor.view.posAtDOM(element, 0);
            const resolved = editor.state.doc.resolve(position);
            for (let depth = resolved.depth; depth > 0; depth--)
              if (names.includes(resolved.node(depth).type.name))
                return {
                  from: resolved.before(depth),
                  node: resolved.node(depth),
                };
            return null;
          };
          const pre = target.closest("pre");
          const block = pre && findNode(pre, ["codeBlock"]);
          if (block)
            items.push(
              null,
              {
                label: "Copy code",
                run: () => window.margin.copyText(block.node.textContent),
              },
              {
                label: "Change code language",
                run: () => {
                  editor.commands.setTextSelection(block.from + 1);
                  requestAnimationFrame(() => {
                    const input = editor.view.dom
                      .closest(".markdown-editor")
                      ?.querySelector<HTMLInputElement>(
                        '[aria-label="Code block language"]',
                      );
                    input?.focus();
                    input?.select();
                  });
                },
              },
              {
                label: "Delete code block",
                danger: true,
                run: () =>
                  editChain()
                    .setNodeSelection(block.from)
                    .deleteSelection()
                    .run(),
              },
            );
          const li = target.closest("li");
          const list = li && findNode(li, ["listItem", "taskItem"]);
          if (list) {
            const itemType = list.node.type.name;
            const listType = editor.state.doc.resolve(list.from).parent.type
              .name;
            const from = list.from + 2;
            const listChain = () => editChain().setTextSelection(from);
            items.push(
              null,
              {
                label: "Indent list item",
                disabled: !editor
                  .can()
                  .chain()
                  .setTextSelection(from)
                  .sinkListItem(itemType)
                  .run(),
                run: () => listChain().sinkListItem(itemType).run(),
              },
              {
                label: "Outdent list item",
                disabled: !editor
                  .can()
                  .chain()
                  .setTextSelection(from)
                  .liftListItem(itemType)
                  .run(),
                run: () => listChain().liftListItem(itemType).run(),
              },
              {
                label: "List type",
                children: [
                  {
                    label: "Bullet list",
                    disabled: listType === "bulletList",
                    run: () => listChain().toggleBulletList().run(),
                  },
                  {
                    label: "Numbered list",
                    disabled: listType === "orderedList",
                    run: () => listChain().toggleOrderedList().run(),
                  },
                  {
                    label: "Checklist",
                    disabled: listType === "taskList",
                    run: () => listChain().toggleTaskList().run(),
                  },
                ],
              },
              ...(itemType === "taskItem"
                ? [
                    {
                      label: list.node.attrs.checked
                        ? "Mark incomplete"
                        : "Mark complete",
                      run: () =>
                        listChain()
                          .updateAttributes("taskItem", {
                            checked: !list.node.attrs.checked,
                          })
                          .run(),
                    },
                  ]
                : []),
            );
          }
          const anchor = target.closest("a");
          if (anchor) {
            const href = anchor.getAttribute("href") || "";
            const from = editor.view.posAtDOM(anchor, 0);
            const selectLink = () =>
              editor.chain().setTextSelection(from).extendMarkRange("link");
            items.push(
              null,
              { label: "Open link", run: () => callbacks.current.onLink(href) },
              {
                label: "Copy link address",
                run: () => window.margin.copyText(href),
              },
              {
                label: "Edit link",
                shortcut: `${modKey}+K`,
                run: () => {
                  selectLink().run();
                  setLinkValue(href);
                  if (editor)
                    linkSelection.current = {
                      from: editor.state.selection.from,
                      to: editor.state.selection.to,
                    };
                  setLinkDialog(true);
                },
              },
              {
                label: "Remove link",
                run: () => selectLink().unsetLink().run(),
              },
            );
          }
          const cell = target.closest("td, th");
          if (cell) {
            // Structural operations always address the clicked cell, even when a
            // text/cell selection was preserved for clipboard actions.
            const from = editor.view.posAtDOM(cell, 0) + 1;
            const tableChain = () => {
              editor.view.dispatch(closeHistory(editor.state.tr));
              return editor.chain().setTextSelection(from);
            };
            items.push(
              null,
              {
                label: "Insert row above",
                run: () => tableChain().addRowBefore().run(),
              },
              {
                label: "Insert row below",
                run: () => tableChain().addRowAfter().run(),
              },
              {
                label: "Insert column left",
                run: () => tableChain().addColumnBefore().run(),
              },
              {
                label: "Insert column right",
                run: () => tableChain().addColumnAfter().run(),
              },
              null,
              {
                label: "Delete row",
                danger: true,
                run: () => tableChain().deleteRow().run(),
              },
              {
                label: "Delete column",
                danger: true,
                run: () => tableChain().deleteColumn().run(),
              },
              {
                label: "Delete table",
                danger: true,
                run: () => tableChain().deleteTable().run(),
              },
            );
          }
          openMenu({
            x: event.clientX,
            y: event.clientY,
            items,
            restoreFocus: () => {
              if (!editor.isDestroyed) editor.view.focus();
            },
          });
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
