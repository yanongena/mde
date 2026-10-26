import fs from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";

const markdown = /\.(md|markdown|mdown)$/i;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, {
    ...defaultSchema,
    protocols: { ...defaultSchema.protocols, src: ["http", "https", "data"] },
  })
  .use(rehypeStringify);

// Keep output locations derived from validated sources or a system-picked directory.
export async function planPdfExport(workspace, request, destination) {
  if (
    !request ||
    typeof request.path !== "string" ||
    !["combined", "subfolders", "files"].includes(request.mode) ||
    typeof request.recursive !== "boolean"
  )
    throw new Error("Invalid PDF export options.");
  const source = await workspace.resolve(request.path);
  const stat = await fs.stat(source);
  if (!stat.isDirectory() && (!stat.isFile() || !markdown.test(source)))
    throw new Error("Choose a Markdown file or a folder.");
  const relative = path
    .relative(workspace.root, source)
    .split(path.sep)
    .join("/");
  const files = stat.isDirectory()
    ? (await workspace.tree())
        .filter(
          (entry) =>
            !entry.directory &&
            markdown.test(entry.path) &&
            (!relative || entry.path.startsWith(relative + "/")) &&
            (request.recursive ||
              path.posix.dirname(entry.path) === (relative || ".")),
        )
        .map((entry) => entry.path)
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    : [relative];
  const groups = new Map();
  const add = (key, output, file) => {
    const group = groups.get(key) || { output, sources: [] };
    group.sources.push(file);
    groups.set(key, group);
  };
  for (const file of files) {
    if (!stat.isDirectory() || request.mode === "files") {
      const output = destination
        ? path.join(
            destination,
            stat.isDirectory()
              ? path.posix.relative(relative || ".", file)
              : path.basename(file),
          )
        : path.join(workspace.root, file);
      add(file, output.replace(markdown, ".pdf"), file);
    } else if (request.mode === "subfolders") {
      const inside = path.posix.relative(relative || ".", file);
      const folder = inside.includes("/") ? inside.split("/")[0] : "";
      const groupSource = folder ? path.join(source, folder) : source;
      add(
        groupSource,
        path.join(
          destination || path.dirname(groupSource),
          path.basename(groupSource) + ".pdf",
        ),
        file,
      );
    } else {
      add(
        source,
        path.join(
          destination || path.dirname(source),
          path.basename(source) + ".pdf",
        ),
        file,
      );
    }
  }
  // Distinguish same-stem Markdown extensions and root/subfolder name collisions.
  const used = new Set();
  const outputs = [];
  for (const { output, sources } of groups.values()) {
    let target = output,
      suffix = 2;
    while (used.has(target.toLowerCase()) || (await pathExists(target)))
      target = output.slice(0, -4) + ` (${suffix++}).pdf`;
    used.add(target.toLowerCase());
    outputs.push({ path: target, sources });
  }
  return { files: files.length, outputs };
}

async function pathExists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function pdfDocument(workspace, documents, title) {
  const sections = [];
  for (const document of documents) {
    // YAML metadata belongs to the source, not the printed document.
    const body = document.text
      .replace(/^\uFEFF/, "")
      .replace(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, "");
    const tree = await processor.run(processor.parse(body));
    const images = [];
    visit(tree, "element", (node) => {
      if (node.tagName === "img") images.push(node);
    });
    for (const image of images) {
      const src = String(image.properties.src || "");
      if (
        /^https:\/\//i.test(src) ||
        /^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)
      )
        continue;
      if (!src || /^[a-z][a-z\d+.-]*:|^\/\//i.test(src)) {
        delete image.properties.src;
        continue;
      }
      const decoded = decodeURIComponent(src.split(/[?#]/)[0]).replace(
        /\\/g,
        "/",
      );
      const name = path.posix.normalize(
        decoded.startsWith("/")
          ? decoded.slice(1)
          : path.posix.join(path.posix.dirname(document.path), decoded),
      );
      try {
        const resolved = await workspace.resolve(name);
        const ext = path.extname(resolved).slice(1).toLowerCase();
        const mime = {
          png: "png",
          jpg: "jpeg",
          jpeg: "jpeg",
          gif: "gif",
          webp: "webp",
          svg: "svg+xml",
          avif: "avif",
          bmp: "bmp",
          ico: "x-icon",
        }[ext];
        if (!mime || (await fs.stat(resolved)).size > 20 * 1024 * 1024)
          throw new Error("Unsupported image or image larger than 20 MB.");
        image.properties.src = `data:image/${mime};base64,${(await fs.readFile(resolved)).toString("base64")}`;
      } catch (error) {
        throw new Error(`Image in ${document.path} (${src}): ${error.message}`);
      }
    }
    sections.push(
      `<article><div class="source">${escape(document.path)}</div>${processor.stringify(tree)}</article>`,
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(title)}</title><style>
    @page { size: A4; margin: 18mm 17mm 20mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #222; background: white; font: 11pt/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; overflow-wrap: anywhere; }
    article + article { break-before: page; }
    .source { font: 8pt/1.4 -apple-system, sans-serif; color: #777; margin-bottom: 8mm; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; break-after: avoid; margin: 1.2em 0 .6em; }
    h1 { font-size: 25pt; } h2 { font-size: 19pt; } h3 { font-size: 14pt; }
    p, ul, ol, pre, blockquote, table { margin: 0 0 1em; }
    a { color: #245e55; text-decoration: underline; }
    img { max-width: 100%; max-height: 235mm; object-fit: contain; }
    pre { background: #f3f4f2; padding: 12px; border: 1px solid #dfe2dd; white-space: pre-wrap; overflow-wrap: anywhere; }
    code { font: 9pt/1.5 Menlo, Consolas, monospace; white-space: break-spaces; }
    :not(pre) > code { background: #f3f4f2; padding: 1px 4px; border-radius: 3px; }
    blockquote { border-left: 3px solid #bdc7be; padding-left: 15px; color: #555; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 9pt; }
    th, td { border: 1px solid #ccd1cb; padding: 6px 8px; vertical-align: top; }
    th { background: #f1f3ef; } thead { display: table-header-group; } tr { break-inside: avoid; }
    hr { border: 0; border-top: 1px solid #ccd1cb; margin: 1.5em 0; }
    .contains-task-list { list-style: none; padding-left: 18px; }
    input[type=checkbox] { accent-color: #245e55; }
  </style></head><body>${sections.join("\n")}</body></html>`;
}

// Exclusive writes preserve existing PDFs, including ones created during rendering.
async function writePdf(output, bytes, destination) {
  async function checkParents() {
    if (!destination) return;
    let current = destination;
    for (const part of path
      .relative(destination, path.dirname(output))
      .split(path.sep)
      .filter(Boolean)) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Error(
            "Symbolic links are excluded from PDF export destinations.",
          );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  await checkParents();
  await fs.mkdir(path.dirname(output), { recursive: true });
  await checkParents();
  let target = output,
    suffix = 2;
  while (true) {
    let handle;
    try {
      handle = await fs.open(target, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      target = output.slice(0, -4) + ` (${suffix++}).pdf`;
      continue;
    }
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await fs.unlink(target).catch(() => {});
      throw error;
    }
    await handle.close();
    return target;
  }
}

export async function exportPdf(
  workspace,
  request,
  { destination, render, signal, onProgress = () => {} },
) {
  const result = { paths: [], failed: [], cancelled: false };
  const plan = await planPdfExport(workspace, request, destination);
  if (signal?.aborted) return { ...result, cancelled: true };
  if (!plan.files)
    throw new Error("No Markdown files found for these options.");
  const overlays = new Map(
    (request.overlays || []).map((item) => [item.path, item.text]),
  );
  // Snapshot every source before creating outputs so one export uses consistent editor contents.
  const documents = new Map();
  for (const output of plan.outputs)
    for (const name of output.sources) {
      if (signal?.aborted) return { ...result, cancelled: true };
      const doc = await workspace.read(name);
      if (overlays.has(name)) {
        if (typeof overlays.get(name) !== "string")
          throw new Error("Invalid editor contents.");
        doc.text = overlays.get(name);
      }
      documents.set(name, doc);
    }
  for (const output of plan.outputs) {
    if (signal?.aborted) {
      result.cancelled = true;
      break;
    }
    onProgress({
      completed: result.paths.length + result.failed.length,
      total: plan.outputs.length,
      path: output.path,
    });
    try {
      const html = await pdfDocument(
        workspace,
        output.sources.map((name) => documents.get(name)),
        path.basename(output.path, ".pdf"),
      );
      signal?.throwIfAborted();
      const bytes = await render(html, signal);
      signal?.throwIfAborted();
      result.paths.push(await writePdf(output.path, bytes, destination));
    } catch (error) {
      if (signal?.aborted) {
        result.cancelled = true;
        break;
      }
      result.failed.push({ path: output.path, message: error.message });
    }
  }
  return result;
}
