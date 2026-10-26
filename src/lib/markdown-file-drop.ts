import { basename, dirname } from "./markdown.ts";

// Drag data cannot be read during native dragover. The explorer publishes only
// a single, verified Markdown file here; folders and batches remain move-only.
let draggedMarkdown: string | null = null;
export function setDraggedMarkdown(path: string | null) {
  draggedMarkdown = path;
}
export function draggedMarkdownFile(transfer: DataTransfer | null) {
  return transfer?.types.includes("application/x-margin-path")
    ? draggedMarkdown
    : null;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
export function dropWord(text: string, offset: number) {
  for (const part of segmenter.segment(text)) {
    if (
      part.isWordLike &&
      offset >= part.index &&
      offset <= part.index + part.segment.length
    )
      return { from: part.index, to: part.index + part.segment.length };
  }
  return null;
}
export function markdownFileHref(documentPath: string, target: string) {
  const parent = dirname(documentPath).split("/").filter(Boolean),
    parts = target.split("/");
  while (parent.length && parts.length && parent[0] === parts[0]) {
    parent.shift();
    parts.shift();
  }
  return [...parent.map(() => ".."), ...parts]
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!'()*]/g,
        (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join("/");
}
export function markdownFileLink(label: string, href: string) {
  return `[${label.replace(/[\\`*_[\]<>~&]/g, "\\$&")}](${href})`;
}
export function linkDropSpacing(before: string, after: string) {
  return {
    before: before && /\S/.test(before) && !/[(\[{]/.test(before) ? " " : "",
    after: after && /\S/.test(after) && !/[)\]},.!?:;]/.test(after) ? " " : "",
  };
}

export type LinkDropRange = { from: number; to: number };
export interface LinkDropAdapter {
  surface: HTMLElement;
  path: string;
  position(x: number, y: number): number | null;
  word(position: number): LinkDropRange | null;
  text(range: LinkDropRange): string;
  dom(position: number): { node: Node; offset: number };
  caret(position: number): { left: number; top: number; bottom: number } | null;
  insert(range: LinkDropRange, label: string, href: string): void;
}

// Draw a separate overlay so hovering never changes the editor's selection,
// source text, or undo history. Both editors use the same hit testing and preview.
export function installMarkdownFileDrop(adapter: LinkDropAdapter) {
  const { surface } = adapter,
    doc = surface.ownerDocument;
  let overlay: HTMLDivElement | null = null;
  function clear() {
    overlay?.remove();
    overlay = null;
  }
  function rectangles(range: LinkDropRange) {
    const start = adapter.dom(range.from),
      end = adapter.dom(range.to),
      domRange = doc.createRange();
    domRange.setStart(start.node, start.offset);
    domRange.setEnd(end.node, end.offset);
    return Array.from(domRange.getClientRects()).filter(
      (rect, index, rects) =>
        rect.width &&
        rect.height &&
        !rects
          .slice(0, index)
          .some(
            (other) =>
              other.left === rect.left &&
              other.top === rect.top &&
              other.width === rect.width &&
              other.height === rect.height,
          ),
    );
  }
  function destination(event: DragEvent) {
    const file = draggedMarkdownFile(event.dataTransfer);
    if (!file) return null;
    const position = adapter.position(event.clientX, event.clientY);
    if (position === null) return null;
    const word = adapter.word(position);
    const rects = word ? rectangles(word) : [];
    const overWord = rects.some(
      (rect) =>
        event.clientX >= rect.left - 1 &&
        event.clientX <= rect.right + 1 &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom,
    );
    const range = word && overWord ? word : { from: position, to: position };
    return {
      range,
      rects: overWord ? rects : [],
      label: overWord ? adapter.text(range) : basename(file),
      href: markdownFileHref(adapter.path, file),
      file,
    };
  }
  function over(event: DragEvent) {
    const target = destination(event);
    if (!target) {
      clear();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = "link";
    clear();
    overlay = doc.createElement("div");
    overlay.className = "markdown-link-drop-overlay";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    const bounds = surface.getBoundingClientRect();
    for (const rect of target.rects) {
      const mark = doc.createElement("div");
      mark.className = "markdown-link-drop-word";
      Object.assign(mark.style, {
        left: Math.max(rect.left, bounds.left) + "px",
        top: Math.max(rect.top, bounds.top) + "px",
        width:
          Math.max(
            0,
            Math.min(rect.right, bounds.right) -
              Math.max(rect.left, bounds.left),
          ) + "px",
        height:
          Math.max(
            0,
            Math.min(rect.bottom, bounds.bottom) -
              Math.max(rect.top, bounds.top),
          ) + "px",
      });
      overlay.append(mark);
    }
    if (!target.rects.length) {
      const caret = adapter.caret(target.range.from);
      if (caret) {
        const mark = doc.createElement("div");
        mark.className = "markdown-link-drop-caret";
        Object.assign(mark.style, {
          left: caret.left + "px",
          top: caret.top + "px",
          height: caret.bottom - caret.top + "px",
        });
        overlay.append(mark);
      }
    }
    const preview = doc.createElement("div");
    preview.className = "markdown-link-drop-preview";
    preview.textContent = `Link “${target.label}” → ${target.file}`;
    overlay.append(preview);
    doc.body.append(overlay);
    const size = preview.getBoundingClientRect(),
      win = doc.defaultView!;
    Object.assign(preview.style, {
      left:
        Math.max(
          8,
          Math.min(event.clientX + 14, win.innerWidth - size.width - 8),
        ) + "px",
      top:
        (event.clientY + size.height + 28 < win.innerHeight
          ? event.clientY + 22
          : Math.max(8, event.clientY - size.height - 12)) + "px",
    });
  }
  function drop(event: DragEvent) {
    const target = destination(event);
    clear();
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    adapter.insert(target.range, target.label, target.href);
  }
  function leave(event: DragEvent) {
    if (!surface.contains(event.relatedTarget as Node | null)) clear();
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") clear();
  }
  surface.addEventListener("dragover", over, true);
  surface.addEventListener("drop", drop, true);
  surface.addEventListener("dragleave", leave);
  doc.addEventListener("dragend", clear);
  doc.addEventListener("drop", clear);
  doc.addEventListener("keydown", key);
  doc.addEventListener("scroll", clear, true);
  doc.defaultView?.addEventListener("blur", clear);
  return () => {
    clear();
    surface.removeEventListener("dragover", over, true);
    surface.removeEventListener("drop", drop, true);
    surface.removeEventListener("dragleave", leave);
    doc.removeEventListener("dragend", clear);
    doc.removeEventListener("drop", clear);
    doc.removeEventListener("keydown", key);
    doc.removeEventListener("scroll", clear, true);
    doc.defaultView?.removeEventListener("blur", clear);
  };
}
