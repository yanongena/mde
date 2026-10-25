import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { splitMetadata } from "./markdown.ts";
import type { MenuItem } from "../components/ContextMenu";

export interface Section {
  title: string;
  anchor: string;
  from: number;
  to: number;
  level: number;
  index: number;
}
type Heading = Omit<Section, "anchor" | "index">;
type MarkdownNode = {
  type: string;
  value?: string;
  alt?: string;
  depth?: number;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};
const parser = unified().use(remarkParse).use(remarkGfm);
const cache = new Map<string, Section[]>();

export const sectionTitle = (text: string) => text.replace(/\s+/g, " ").trim();
export const sectionSlug = (text: string) =>
  sectionTitle(text)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-") || "section";

export function headingSections(headings: Heading[]): Section[] {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  return headings.map((heading, index) => {
    const base = sectionSlug(heading.title);
    let suffix = nextSuffix.get(base) || 0;
    let anchor = suffix ? `${base}-${suffix}` : base;
    while (used.has(anchor)) anchor = `${base}-${++suffix}`;
    nextSuffix.set(base, suffix + 1);
    used.add(anchor);
    return { ...heading, title: sectionTitle(heading.title), anchor, index };
  });
}

function plainText(node: MarkdownNode): string {
  if (node.type === "image") return node.alt || "";
  if (node.type === "break") return " ";
  if (node.type === "html") return "";
  return node.value ?? node.children?.map(plainText).join("") ?? "";
}

export function markdownSections(text: string): Section[] {
  const previous = cache.get(text);
  if (previous) return previous;
  if (text.length > 10 * 1024 * 1024) return [];
  const { prefix } = splitMetadata(text);
  // Mask metadata, preserving every source offset and CRLF pair.
  const body = prefix.replace(/[^\r\n]/g, " ") + text.slice(prefix.length);
  const headings: Heading[] = [];
  const visit = (node: MarkdownNode) => {
    if (
      node.type === "heading" &&
      node.position?.start.offset !== undefined &&
      node.position.end.offset !== undefined
    )
      headings.push({
        title: plainText(node),
        from: node.position.start.offset,
        to: node.position.end.offset,
        level: node.depth || 1,
      });
    node.children?.forEach(visit);
  };
  visit(parser.parse(body) as MarkdownNode);
  const result = headingSections(headings);
  if (text.length <= 2_000_000) {
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(text, result);
  }
  return result;
}

const encode = (text: string) =>
  encodeURIComponent(text).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
export function sectionLink(path: string, section: Section): string {
  const title = (section.title || "Section").replace(/[\\`*_[\]<>~&]/g, "\\$&");
  return `[${title}](${sectionURL(path, section)})`;
}
const sectionURL = (path: string, section: Section) =>
  `/${path.split("/").map(encode).join("/")}#${encode(section.anchor)}`;
const htmlText = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function sectionMenuItems(path: string, section: Section): MenuItem[] {
  return [
    {
      label: "Copy section link",
      run: () =>
        window.margin.copyText(
          sectionLink(path, section),
          `<a href="${htmlText(sectionURL(path, section))}">${htmlText(section.title || "Section")}</a>`,
        ),
    },
    {
      label: "Copy section title",
      run: () => window.margin.copyText(section.title),
    },
  ];
}
