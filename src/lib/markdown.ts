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
  const { body } = splitMetadata(text);
  // HTML in a fenced or inline code example is literal code. The Markdown
  // serializer also uses the standard <br> spelling for a table-cell break.
  let fence = "",
    fenceLength = 0;
  const inspected = body
    .split("\n")
    .map((line) => {
      const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (match) {
        if (!fence) {
          fence = match[1][0];
          fenceLength = match[1].length;
        } else if (match[1][0] === fence && match[1].length >= fenceLength)
          fence = "";
        return "";
      }
      return fence ? "" : line;
    })
    .join("\n")
    .replace(/(`+)[\s\S]*?\1/g, "")
    .replace(/<br\s*\/?>/gi, "");
  // Never interpret raw HTML or unsupported extensions as an editable rich document.
  const checks: [RegExp, string][] = [
    [/<\/?[A-Za-z][A-Za-z\d-]*(?:\s[^>]*|\s*\/?)>|<!--/m, "embedded HTML"],
    [/^ {0,3}\[[^\]]+\]:/m, "reference definitions or footnotes"],
    [/!?\[\[/, "wiki links"],
    [/^\$\$|\$[^\s$][^$]*\$/m, "mathematical notation"],
    [/^:::/m, "custom Markdown directives"],
  ];
  return checks.find(([test]) => test.test(inspected))?.[1] || null;
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
