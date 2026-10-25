import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  quickFiles,
  parseFileQuery,
  lineOffset,
  fuzzyScore,
} from "../src/lib/quick-open.ts";
import { lineDiff } from "../src/lib/line-diff.ts";
import { Workspace } from "../electron/workspace.mjs";
import { Transactions } from "../electron/transactions.mjs";
test("P2 Quick Open ranks filenames, fuzzy sequences and recent files and maps CRLF line/columns", () => {
  const entries = [
    "notes/welcome.md",
    "notes/world.md",
    "src/workspace.ts",
  ].map((path) => ({ path, directory: false }));
  assert.equal(
    quickFiles(entries, "", ["notes/world.md"])[0].path,
    "notes/world.md",
  );
  assert.equal(quickFiles(entries, "welmd", [])[0].path, "notes/welcome.md");
  assert.equal(quickFiles(entries, "world.md", [])[0].path, "notes/world.md");
  assert.equal(fuzzyScore("hi.md", "z"), null);
  assert.deepEqual(parseFileQuery("notes/welcome.md:42:3"), {
    query: "notes/welcome.md",
    line: 42,
    column: 3,
  });
  assert.equal(parseFileQuery("hi:0").line, undefined);
  assert.equal(lineOffset("one\r\ntwo\r\n", 2, 2), 6);
  assert.equal(lineOffset("one\r\ntwo\r\n", 1, 100), 3);
  assert.equal(lineOffset("one", 200, 1), 3);
});
test("P2 conflict diff aligns inserted, removed, replaced and unchanged lines with source numbers", () => {
  const rows = lineDiff(
    "same\nold\nkept\ntail",
    "same\nnew\nextra\nkept\ntail",
  );
  assert.equal(rows[0].changed, false);
  assert.deepEqual(
    rows.find((row) => row.left === "kept"),
    { left: "kept", right: "kept", leftLine: 3, rightLine: 4, changed: false },
  );
  assert.ok(rows.find((row) => row.left === "old" && row.changed));
  assert.ok(
    rows.find((row) => row.right === "extra" && row.left === undefined),
  );
  assert.equal(
    lineDiff("a\r\nb\r\n", "a\nb\n").every((row) => !row.changed),
    true,
  );
  const reduced = lineDiff("a\nb", "a");
  assert.ok(reduced.find((row) => row.left === "b" && row.right === undefined));
});
test("P2 conflict previews bound large divergent files without an unbounded LCS allocation", () => {
  const left = Array.from({ length: 12000 }, (_, i) => `old ${i}`).join("\n"),
    right = Array.from({ length: 12000 }, (_, i) => `new ${i}`).join("\n");
  const rows = lineDiff(left, right);
  assert.equal(rows.length, 5001);
  assert.ok(rows.every((row) => row.changed));
  assert.equal(rows.at(-1).rightLine, 5001);
});
test("P2 Save Copy stores a dirty snapshot, rebases relative links and refuses collisions/traversal/symlinks", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "margin-p2-unit-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "workspace");
  await fs.mkdir(root);
  await fs.mkdir(path.join(root, "notes"));
  await fs.mkdir(path.join(root, "archive"));
  const tx = new Transactions(path.join(base, "recovery"));
  await tx.recover();
  const w = new Workspace(root, tx);
  await fs.writeFile(path.join(root, "notes/a.md"), "# Original\n");
  const text = "\uFEFF# Draft\r\n\r\n[other](b.md#title)\r\n";
  const saved = await w.saveCopy("notes/a.md", "archive/copy.md", text);
  assert.equal(saved.text, text.replace("b.md", "../notes/b.md"));
  assert.equal(
    await fs.readFile(path.join(root, "archive/copy.md"), "utf8"),
    saved.text,
  );
  assert.equal(
    await fs.readFile(path.join(root, "notes/a.md"), "utf8"),
    "# Original\n",
  );
  await assert.rejects(
    w.saveCopy("notes/a.md", "archive/copy.md", "overwrite"),
    /exist/,
  );
  await assert.rejects(w.saveCopy("notes/a.md", "../escape.md", text));
  await fs.symlink(base, path.join(root, "shortcut"), "dir");
  await assert.rejects(
    w.saveCopy("notes/a.md", "shortcut/escape.md", text),
    /Symbolic/,
  );
  const results = await Promise.allSettled([
    w.saveCopy("notes/a.md", "race.txt", "first"),
    w.saveCopy("notes/a.md", "race.txt", "second"),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(await fs.readFile(path.join(root, "race.txt"), "utf8"), "first");
  await assert.rejects(
    w.saveCopy("notes/a.md", "huge.txt", "a".repeat(10 * 1024 * 1024 + 1)),
    /10 MB/,
  );
});
