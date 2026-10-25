import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

const parser = unified().use(remarkParse).use(remarkGfm);
export const slash = (value) => value.replace(/\\/g, "/");
export const isWithin = (name, parent) => {
  const a = process.platform === "win32" ? name.toLowerCase() : name,
    b = process.platform === "win32" ? parent.toLowerCase() : parent;
  return a === b || a.startsWith(b + "/");
};
export const remap = (name, from, to) =>
  isWithin(name, from) ? to + name.slice(from.length) : name;

// Locate only the URL token, never reserialize a note just to update a path.
function destinationRange(raw, type) {
  let start;
  if (type === "definition") {
    const match = raw.match(/^\s{0,3}\[[^\n]+?\]:\s*/);
    if (!match) return null;
    start = match[0].length;
  } else {
    let depth = 0,
      end = -1;
    for (let i = raw[0] === "!" ? 1 : 0; i < raw.length; i++) {
      if (raw[i] === "\\") {
        i++;
        continue;
      }
      if (raw[i] === "[") depth++;
      if (raw[i] === "]" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0 || raw[end] !== "(") return null;
    start = end + 1;
    while (/\s/.test(raw[start] ?? "") && start < raw.length) start++;
  }
  if (raw[start] === "<") {
    const end = raw.indexOf(">", start + 1);
    return end < 0 ? null : [start + 1, end];
  }
  let depth = 0,
    end = start;
  for (; end < raw.length; end++) {
    const c = raw[end];
    if (c === "\\") {
      end++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      if (!depth) break;
      depth--;
    } else if (/\s/.test(c) && !depth) break;
  }
  return [start, end];
}

export function references(markdown, documentPath) {
  // Metadata is not a Markdown document. Mask it without changing offsets.
  const meta = markdown.match(
    /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/,
  )?.[0];
  const input = meta
    ? meta.replace(/[^\r\n]/g, " ") + markdown.slice(meta.length)
    : markdown;
  const tree = parser.parse(input);
  const found = [];
  visit(tree, (node) => {
    if (
      !["link", "image", "definition"].includes(node.type) ||
      !node.url ||
      !node.position
    )
      return;
    const url = node.url;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(url)) return;
    const suffixAt = url.search(/[?#]/);
    const pathname = suffixAt < 0 ? url : url.slice(0, suffixAt);
    if (!pathname) return;
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return;
    }
    const rootRelative = decoded.startsWith("/");
    const target = path.posix.normalize(
      rootRelative
        ? decoded.slice(1)
        : path.posix.join(
            path.posix.dirname(slash(documentPath)),
            slash(decoded),
          ),
    );
    if (target === ".." || target.startsWith("../")) return;
    const offset = node.position.start.offset;
    const raw = markdown.slice(offset, node.position.end.offset);
    const range = destinationRange(raw, node.type);
    if (!range) return;
    found.push({
      target,
      suffix: suffixAt < 0 ? "" : url.slice(suffixAt),
      rootRelative,
      explicitDot: pathname.startsWith("./"),
      start: offset + range[0],
      end: offset + range[1],
    });
  });
  return found;
}

export function rewriteReferences(
  markdown,
  oldDocument,
  newDocument,
  from,
  to,
) {
  let result = markdown;
  for (const ref of references(markdown, oldDocument).reverse()) {
    const target = remap(ref.target, from, to);
    if (
      target === ref.target &&
      path.posix.dirname(oldDocument) === path.posix.dirname(newDocument)
    )
      continue;
    let relative = ref.rootRelative
      ? "/" + target
      : path.posix.relative(path.posix.dirname(newDocument), target);
    if (!relative) relative = path.posix.basename(target);
    if (ref.explicitDot && !relative.startsWith(".") && !ref.rootRelative)
      relative = "./" + relative;
    const encoded = relative
      .split("/")
      .map((part) =>
        encodeURIComponent(part).replace(
          /[!'()*]/g,
          (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
        ),
      )
      .join("/");
    result =
      result.slice(0, ref.start) + encoded + ref.suffix + result.slice(ref.end);
  }
  return result;
}
