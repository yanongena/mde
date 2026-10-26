import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readPdf } from "../electron/pdf-files.mjs";
import { savedPosition } from "../electron/session.mjs";
import { Workspace } from "../electron/workspace.mjs";
import {
  isPDF,
  isReadOnlyPreview,
  supportsVisualMode,
} from "../src/lib/document-mode.ts";

test("PDF reading returns binary bytes and refuses non-PDF, oversized, escaped and symlink files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "margin-pdf-read-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root, { blocked: [] });
  const bytes = Buffer.from("%PDF-1.7\n\x00\xff\n%%EOF", "binary");
  const target = path.join(root, "sample.PDF");
  await fs.writeFile(target, bytes);
  assert.deepEqual(Buffer.from(await readPdf(workspace, "sample.PDF")), bytes);
  assert.deepEqual(await fs.readFile(target), bytes);
  await fs.writeFile(path.join(root, "invalid.pdf"), "not a PDF");
  await assert.rejects(readPdf(workspace, "invalid.pdf"), /not a valid PDF/);
  await assert.rejects(readPdf(workspace, "sample.txt"), /Choose a PDF/);
  await assert.rejects(readPdf(workspace, "../sample.pdf"), /outside/);
  await fs.symlink(target, path.join(root, "linked.pdf"));
  await assert.rejects(readPdf(workspace, "linked.pdf"), /Symbolic/);
  const large = await fs.open(path.join(root, "large.pdf"), "w");
  await large.truncate(100 * 1024 * 1024 + 1);
  await large.close();
  await assert.rejects(readPdf(workspace, "large.pdf"), /100 MB/);
});

test("PDF documents remain read-only and persist only validated PDF page and zoom state", () => {
  assert.equal(isPDF("notes/a.PDF"), true);
  assert.equal(isPDF("a.pdf.md"), false);
  assert.equal(isReadOnlyPreview("a.pdf"), true);
  assert.equal(isReadOnlyPreview("image.png"), true);
  assert.equal(isReadOnlyPreview("note.md"), false);
  assert.equal(supportsVisualMode("a.pdf"), false);
  const position = {
    mode: "source",
    signature: "pdf",
    anchor: 0,
    head: 0,
    sourceAnchor: 0,
    sourceHead: 0,
    scrollTop: 800,
    topSource: 0,
    topOffset: 0,
    scrollRatio: 0.5,
    pdf: { page: 3, scale: "page-width" },
  };
  assert.deepEqual(savedPosition(position).pdf, position.pdf);
  assert.deepEqual(
    savedPosition({ ...position, pdf: { page: 1, scale: "1.25" } }).pdf,
    { page: 1, scale: "1.25" },
  );
  assert.equal(
    savedPosition({ ...position, pdf: { page: -1, scale: "4" } }).pdf,
    undefined,
  );
  assert.equal(
    savedPosition({ ...position, pdf: { page: 2, scale: "NaN" } }).pdf,
    undefined,
  );
  assert.equal(
    savedPosition({ ...position, pdf: { page: 2, scale: "10000" } }).pdf,
    undefined,
  );
});
