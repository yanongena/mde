import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Workspace } from "../electron/workspace.mjs";
import { Transactions } from "../electron/transactions.mjs";
import {
  planPdfExport,
  pdfDocument,
  exportPdf,
} from "../electron/pdf-export.mjs";

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "margin-pdf-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "workspace");
  await fs.mkdir(root);
  const tx = new Transactions(path.join(base, "recovery"));
  await tx.recover();
  const workspace = new Workspace(root, tx);
  const write = async (name, text) => {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), text);
  };
  await write("notes/01.md", "# First");
  await write("notes/a/02.markdown", "# Second");
  await write("notes/a/deep/03.MD", "# Third");
  await write("notes/b/04.mdown", "# Fourth");
  await write("notes/not-a-note.txt", "ignored");
  await write("notes/node_modules/ignore.md", "ignored");
  return { base, root, workspace, write };
}
const options = (extra = {}) => ({
  path: "notes",
  mode: "combined",
  recursive: true,
  ...extra,
});

test("PDF grouping includes nested Markdown, respects ignores and defaults beside each source", async (t) => {
  const { root, base, workspace } = await fixture(t);
  const combined = await planPdfExport(workspace, options());
  assert.equal(combined.files, 4);
  assert.equal(combined.outputs[0].path, path.join(root, "notes.pdf"));
  assert.deepEqual(combined.outputs[0].sources, [
    "notes/01.md",
    "notes/a/02.markdown",
    "notes/a/deep/03.MD",
    "notes/b/04.mdown",
  ]);
  const folders = await planPdfExport(
    workspace,
    options({ mode: "subfolders" }),
  );
  assert.deepEqual(
    folders.outputs.map((item) => [
      path.relative(root, item.path),
      item.sources.length,
    ]),
    [
      ["notes.pdf", 1],
      ["notes/a.pdf", 2],
      ["notes/b.pdf", 1],
    ],
  );
  const files = await planPdfExport(workspace, options({ mode: "files" }));
  assert.deepEqual(
    files.outputs.map((item) => path.relative(root, item.path)),
    ["notes/01.pdf", "notes/a/02.pdf", "notes/a/deep/03.pdf", "notes/b/04.pdf"],
  );
  assert.equal(
    (await planPdfExport(workspace, options({ recursive: false }))).files,
    1,
  );
  assert.equal(
    (await planPdfExport(workspace, options({ path: "" }))).outputs[0].path,
    path.join(base, "workspace.pdf"),
  );
  assert.equal(
    (await planPdfExport(workspace, options({ path: "notes/a/02.markdown" })))
      .outputs[0].path,
    path.join(root, "notes/a/02.pdf"),
  );
});

test("custom locations retain per-file folders and same-stem sources never merge or overwrite", async (t) => {
  const { base, root, workspace, write } = await fixture(t);
  await write("notes/01.markdown", "Separate note");
  await write("notes/01.pdf", "existing PDF");
  const planned = await planPdfExport(workspace, options({ mode: "files" }));
  assert.equal(planned.outputs.length, 5);
  assert.deepEqual(
    planned.outputs.slice(0, 2).map((item) => path.basename(item.path)),
    ["01 (2).pdf", "01 (3).pdf"],
  );
  assert.ok(planned.outputs.every((item) => item.sources.length === 1));
  const destination = path.join(base, "exports");
  const custom = await planPdfExport(
    workspace,
    options({ mode: "files" }),
    destination,
  );
  assert.equal(custom.outputs[3].path, path.join(destination, "a/deep/03.pdf"));
  assert.equal(
    await fs.readFile(path.join(root, "notes/01.pdf"), "utf8"),
    "existing PDF",
  );
});

test("Markdown PDF HTML renders GFM, safe HTML and relative images without executable content", async (t) => {
  const { workspace, write } = await fixture(t);
  await write("assets/image.png", Buffer.from("image"));
  const html = await pdfDocument(
    workspace,
    [
      {
        path: "notes/01.md",
        text: `---\nprivate: hidden\n---\n# Café & België\n\n| A | B |\n| - | - |\n| one | two |\n\n- [x] Done\n\n![Local](../assets/image.png)\n\n![Inline](data:image/png;base64,aW1hZ2U=)\n\n<strong>Safe HTML</strong><script>evil()</script><img src="javascript:evil()" onerror="evil()">\n\n\`\`\`js\nconst x = '<tag>';\n\`\`\``,
      },
    ],
    "Title <test>",
  );
  assert.match(html, /<h1>Café &#x26; België<\/h1>/);
  assert.match(html, /<table>/);
  assert.match(html, /type="checkbox" checked disabled/);
  assert.equal(
    (html.match(/src="data:image\/png;base64,aW1hZ2U="/g) || []).length,
    2,
  );
  assert.match(html, /<strong>Safe HTML<\/strong>/);
  assert.match(html, /&#x3C;tag>/);
  assert.doesNotMatch(html, /<script|onerror|evil\(\)|private: hidden/);
  assert.match(html, /<title>Title &lt;test&gt;<\/title>/);
  await assert.rejects(
    pdfDocument(
      workspace,
      [{ path: "notes/01.md", text: "![x](../../outside.png)" }],
      "Unsafe",
    ),
    /outside|editable workspace/,
  );
});

test("export snapshots unsaved buffers, reports partial failures and keeps concurrent existing PDFs", async (t) => {
  const { workspace, root, write } = await fixture(t);
  let calls = 0;
  const result = await exportPdf(
    workspace,
    options({
      mode: "files",
      overlays: [{ path: "notes/01.md", text: "# Unsaved" }],
    }),
    {
      render: async (html) => {
        calls++;
        if (calls === 1) {
          assert.match(html, /Unsaved/);
          await write("notes/01.pdf", "concurrent PDF");
          await write("notes/a/02.markdown", "# Changed after snapshot");
        }
        if (calls === 2) {
          assert.match(html, /Second/);
          throw new Error("Print failure");
        }
        return Buffer.from("%PDF-test");
      },
    },
  );
  assert.equal(result.paths.length, 3);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].message, "Print failure");
  assert.equal(result.paths[0], path.join(root, "notes/01 (2).pdf"));
  assert.equal(
    await fs.readFile(path.join(root, "notes/01.pdf"), "utf8"),
    "concurrent PDF",
  );
  assert.equal(
    await fs.readFile(path.join(root, "notes/01.md"), "utf8"),
    "# First",
  );
});

test("cancellation preserves completed PDFs and writes no partial current PDF", async (t) => {
  const { workspace } = await fixture(t);
  const controller = new AbortController();
  let calls = 0;
  const result = await exportPdf(workspace, options({ mode: "files" }), {
    signal: controller.signal,
    render: async () => {
      if (++calls === 2) controller.abort();
      return Buffer.from("%PDF-test");
    },
  });
  assert.equal(result.paths.length, 1);
  assert.equal(result.cancelled, true);
  assert.equal(result.failed.length, 0);
  const alreadyCancelled = await exportPdf(workspace, options(), {
    signal: controller.signal,
    render: async () => { throw new Error("Cancelled exports must not print."); },
  });
  assert.equal(alreadyCancelled.cancelled, true);
  assert.deepEqual(alreadyCancelled.paths, []);
});

test("source escapes and symlinks are refused; custom nested destinations cannot follow symlinks", async (t) => {
  const { workspace, base, root } = await fixture(t);
  await assert.rejects(
    planPdfExport(workspace, options({ path: "../outside" })),
    /outside/,
  );
  await assert.rejects(
    planPdfExport(workspace, options({ path: "notes/not-a-note.txt" })),
    /Markdown/,
  );
  await fs.symlink(
    path.join(root, "notes/01.md"),
    path.join(root, "linked.md"),
  );
  await assert.rejects(
    planPdfExport(workspace, options({ path: "linked.md" })),
    /Symbolic/,
  );
  const destination = path.join(base, "export");
  const outside = path.join(base, "outside");
  await fs.mkdir(destination);
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(destination, "a"));
  const result = await exportPdf(workspace, options({ mode: "files" }), {
    destination,
    render: async () => Buffer.from("%PDF-test"),
  });
  assert.equal(result.paths.length, 2);
  assert.equal(result.failed.length, 2);
  assert.deepEqual(await fs.readdir(outside), []);
});
