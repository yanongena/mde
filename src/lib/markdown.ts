import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const protectionCache = new Map<string, string | null>();

export const isMarkdown = (name: string) =>
  /\.(md|markdown|mdown)$/i.test(name);
export const isImage = (name: string) =>
  /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i.test(name);
export const basename = (name: string) => name.split(/[\\/]/).pop() || name;
export const dirname = (name: string) =>
  name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";
export function splitMetadata(text: string) {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = text.slice(bom.length);
  const meta =
    body.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/)?.[0] ||
    "";
  return {
    prefix: bom + meta,
    body: body.slice(meta.length),
    eol: text.includes("\r\n") ? "\r\n" : "\n",
    trailing: /\r?\n$/.test(text),
  };
}
export function visualProtection(text: string): string | null {
  if (protectionCache.has(text)) return protectionCache.get(text)!;
  const { body } = splitMetadata(text);
  // Parse Markdown so code examples and <angle-bracket link destinations>
  // cannot be mistaken for embedded HTML. Keep line breaks for the checks below.
  const tree = markdownParser.parse(body);
  const parts: string[] = [];
  let cursor = 0,
    html = false,
    definitions = false;
  const visit = (node: typeof tree | (typeof tree.children)[number]): void => {
    if (node.type === "code" || node.type === "inlineCode") {
      const from = node.position?.start.offset ?? cursor;
      const to = node.position?.end.offset ?? from;
      parts.push(
        body.slice(cursor, from),
        body.slice(from, to).replace(/[^\r\n]/g, " "),
      );
      cursor = to;
      return;
    }
    // The visual serializer uses <br> for table-cell line breaks.
    if (node.type === "html" && node.value.replace(/<br\s*\/?>/gi, "").trim())
      html = true;
    if (node.type === "definition" || node.type === "footnoteDefinition")
      definitions = true;
    if ("children" in node) node.children.forEach(visit);
  };
  visit(tree);
  parts.push(body.slice(cursor));
  const inspected = parts.join("");
  // Never interpret raw HTML or unsupported extensions as an editable rich document.
  const checks: [RegExp, string][] = [
    [/!?\[\[/, "wiki links"],
    [/^\$\$|\$[^\s$][^$]*\$/m, "mathematical notation"],
    [/^:::/m, "custom Markdown directives"],
  ];
  const reason = html
    ? "embedded HTML"
    : definitions
      ? "reference definitions or footnotes"
      : checks.find(([test]) => test.test(inspected))?.[1] || null;
  if (text.length <= 2_000_000) {
    if (protectionCache.size >= 8)
      protectionCache.delete(protectionCache.keys().next().value!);
    protectionCache.set(text, reason);
  }
  return reason;
}
export function assetURL(documentPath: string, src: string) {
  if (
    /^https:\/\//i.test(src) ||
    /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)
  )
    return src;
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(src)) return "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(src.split(/[?#]/)[0]);
  } catch {
    return "";
  }
  const parts = (
    decoded.startsWith("/")
      ? decoded.slice(1)
      : dirname(documentPath) + "/" + decoded
  )
    .replace(/\\/g, "/")
    .split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      if (!normalized.length) return "";
      normalized.pop();
    } else if (part && part !== ".") normalized.push(part);
  }
  return (
    "margin-asset://workspace/" + normalized.map(encodeURIComponent).join("/")
  );
}
export function resolveLink(documentPath: string, href: string) {
  if (/^https?:\/\//i.test(href)) return { external: href };
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(href))
    throw new Error("This link protocol is not supported.");
  const [raw, anchor] = href.split("#");
  const decoded = decodeURIComponent(raw.split("?")[0]);
  const parts = (
    decoded.startsWith("/")
      ? decoded.slice(1)
      : dirname(documentPath) + "/" + decoded
  )
    .replace(/\\/g, "/")
    .split("/");
  const normalized: string[] = [];
  for (const p of parts) {
    if (p === "..") {
      if (!normalized.length) throw new Error("Link is outside the workspace.");
      normalized.pop();
    } else if (p && p !== ".") normalized.push(p);
  }
  return {
    path: raw ? normalized.join("/") : documentPath,
    anchor: anchor ? decodeURIComponent(anchor) : undefined,
  };
}
