import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { splitMetadata } from "./markdown.ts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorPosition } from "../types";

export interface Projection {
  text: string;
  positions: number[];
  ends: number[];
}
const parser = unified().use(remarkParse).use(remarkGfm);
const projectionCache = new Map<string, Projection>();
type Node = {
  type: string;
  value?: string;
  alt?: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

export function textSignature(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}

export function markdownProjection(text: string): Projection {
  const cached = projectionCache.get(text);
  if (cached) return cached;
  const result: Projection = { text: "", positions: [], ends: [] };
  const { prefix } = splitMetadata(text);
  const input = prefix.replace(/[^\r\n]/g, " ") + text.slice(prefix.length);
  const append = (value: string, start: number, end: number) => {
    const raw = text.slice(start, end);
    let cursor = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "\n") {
        const newline = raw.indexOf("\n", cursor);
        if (newline >= 0) {
          result.positions.push(
            start + (raw[newline - 1] === "\r" ? newline - 1 : newline),
          );
          result.ends.push(start + newline + 1);
          result.text += "\n";
          cursor = newline + 1;
          continue;
        }
      }
      if (raw[cursor] === "\\" && raw[cursor + 1] === value[i]) cursor++;
      if (raw[cursor] !== value[i]) {
        if (
          raw[cursor] === "&" &&
          /^&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(raw.slice(cursor))
        ) {
          result.positions.push(start + cursor);
          cursor += raw.slice(cursor).indexOf(";") + 1;
          result.ends.push(start + cursor);
          result.text += value[i];
          if (
            /[\uD800-\uDBFF]/.test(value[i]) &&
            /[\uDC00-\uDFFF]/.test(value[i + 1] || "")
          ) {
            result.positions.push(
              result.positions[result.positions.length - 1],
            );
            result.ends.push(start + cursor);
            result.text += value[++i];
          }
          continue;
        }
        const found = raw.indexOf(value[i], cursor);
        if (found >= 0) cursor = found;
      }
      result.positions.push(Math.min(end, start + cursor));
      result.text += value[i];
      cursor++;
      result.ends.push(Math.min(end, start + cursor));
    }
  };
  const inline = (node: Node) => {
    const start = node.position?.start.offset ?? 0,
      end = node.position?.end.offset ?? start;
    if (node.type === "html") return;
    if (node.type === "break") {
      append("\n", start, end);
      return;
    }
    const value = node.type === "image" ? node.alt : node.value;
    if (value !== undefined) {
      const raw = text.slice(start, end);
      const contentStart =
        node.type === "code" && /^ {0,3}(?:`{3,}|~{3,})/.test(raw)
          ? start + raw.indexOf("\n") + 1
          : start;
      if (node.type === "code") {
        const lines = value.replace(/\r\n/g, "\n").split("\n");
        let row = contentStart;
        lines.forEach((line, index) => {
          const newline = text.indexOf("\n", row);
          const rowEnd = newline < 0 ? end : Math.min(end, newline);
          const offset = text.slice(row, rowEnd).indexOf(line);
          append(line, row + Math.max(0, offset), rowEnd);
          if (index < lines.length - 1)
            append(
              "\n",
              text[rowEnd - 1] === "\r" ? rowEnd - 1 : rowEnd,
              Math.min(end, rowEnd + 1),
            );
          row = rowEnd + 1;
        });
      } else append(value.replace(/\r\n/g, "\n"), contentStart, end);
    } else node.children?.forEach(inline);
  };
  const visit = (node: Node) => {
    if (["paragraph", "heading", "code", "tableCell"].includes(node.type)) {
      if (result.text) {
        result.text += "\n";
        result.positions.push(node.position?.start.offset ?? 0);
        result.ends.push(node.position?.start.offset ?? 0);
      }
      inline(node);
    } else node.children?.forEach(visit);
  };
  visit(parser.parse(input) as Node);
  result.positions.push(text.length);
  if (text.length <= 2_000_000) {
    if (projectionCache.size >= 4)
      projectionCache.delete(projectionCache.keys().next().value!);
    projectionCache.set(text, result);
  }
  return result;
}

const pmCache = new WeakMap<ProseMirrorNode, Projection>();
export function visualProjection(doc: ProseMirrorNode): Projection {
  const cached = pmCache.get(doc);
  if (cached) return cached;
  const result: Projection = { text: "", positions: [], ends: [] };
  doc.descendants((node, from) => {
    if (!node.isTextblock) return;
    if (result.text) {
      result.text += "\n";
      result.positions.push(from + 1);
      result.ends.push(from + 1);
    }
    node.descendants((child, offset) => {
      const value = child.isText
        ? child.text || ""
        : child.type.name === "hardBreak"
          ? "\n"
          : child.type.name === "image"
            ? String(child.attrs.alt || "")
            : "";
      for (let i = 0; i < value.length; i++) {
        result.text += value[i];
        result.positions.push(from + 1 + offset + (child.isText ? i : 0));
        result.ends.push(
          from + 1 + offset + (child.isText ? i + 1 : child.nodeSize),
        );
      }
    });
    return false;
  });
  result.positions.push(Math.max(1, doc.content.size - 1));
  pmCache.set(doc, result);
  return result;
}

function indexAt(projection: Projection, position: number) {
  let low = 0,
    high = projection.positions.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (projection.positions[middle] < position) low = middle + 1;
    else high = middle;
  }
  return low;
}
function transfer(
  from: Projection,
  to: Projection,
  position: number,
  backward = false,
) {
  let index = indexAt(from, position);
  if (from.text !== to.text) {
    const start = Math.max(0, index - 18),
      needle = from.text.slice(start, Math.min(from.text.length, index + 24));
    const expected = Math.round(
      (index / Math.max(1, from.text.length)) * to.text.length,
    );
    let found = -1,
      candidate = to.text.indexOf(needle);
    while (needle && candidate >= 0) {
      if (
        found < 0 ||
        Math.abs(candidate - expected) < Math.abs(found - expected)
      )
        found = candidate;
      candidate = to.text.indexOf(needle, candidate + 1);
    }
    index = found < 0 ? expected : found + index - start;
  }
  if (backward && index > 0)
    return to.ends[Math.min(index - 1, to.ends.length - 1)] ?? 0;
  return to.positions[Math.min(index, to.positions.length - 1)] ?? 0;
}
export const visualToSource = (
  text: string,
  doc: ProseMirrorNode,
  position: number,
  backward = false,
) =>
  transfer(visualProjection(doc), markdownProjection(text), position, backward);
export const sourceToVisual = (
  text: string,
  doc: ProseMirrorNode,
  position: number,
) => transfer(markdownProjection(text), visualProjection(doc), position);

export interface EditorHandle {
  focus?(): void;
  selectionVisible?(): boolean;
  capture(): EditorPosition;
  restore(position: EditorPosition, focus?: boolean): void;
  reveal(from: number, to?: number): void;
}
const handles = new Map<string, EditorHandle>();
const key = (path: string, mode: string) => `${mode}\0${path}`;
export function registerEditor(
  path: string,
  mode: string,
  handle: EditorHandle,
) {
  handles.set(key(path, mode), handle);
  return () => {
    if (handles.get(key(path, mode)) === handle)
      handles.delete(key(path, mode));
  };
}
export const editorHandle = (path: string, mode: string) =>
  handles.get(key(path, mode));
export function positionChanged(
  path: string,
  kind: "selection" | "scroll" = "selection",
) {
  window.dispatchEvent(
    new CustomEvent("margin:position-changed", { detail: { path, kind } }),
  );
}
