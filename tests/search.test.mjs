import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Workspace } from "../electron/workspace.mjs";
import { searchWorkspace, pathFilter } from "../electron/search.mjs";
import { textMatches } from "../electron/search-core.mjs";
const request = (query, patch = {}) => ({
  id: "test",
  query,
  include: "",
  exclude: "",
  caseSensitive: false,
  wholeWord: false,
  overlays: [],
  ...patch,
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "margin-search-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (name, value) => {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), value);
  };
  return { root, write, workspace: new Workspace(root, { blocked: [] }) };
}

test("workspace search returns exact UTF-16 positions, CRLF lines and preview ranges", async (t) => {
  const { write, workspace } = await fixture(t);
  const text = "\uFEFF# Café\r\n\r\nA 😀 needle here.\r\nneedle again.\r\n";
  await write("notes/a.md", text);
  const result = await searchWorkspace(workspace, request("needle"));
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map((hit) => [hit.line, hit.column]),
    [
      [3, 6],
      [4, 1],
    ],
  );
  for (const hit of result.matches) {
    assert.equal(text.slice(hit.from, hit.to), "needle");
    assert.equal(hit.preview.slice(hit.matchStart, hit.matchEnd), "needle");
  }
});
test("workspace filters honor ignores, nested globs, binary refusal and symlink confinement", async (t) => {
  const { root, write, workspace } = await fixture(t);
  await write("root.md", "needle");
  await write("src/a.md", "needle");
  await write("src/a.js", "needle");
  await write("node_modules/private.md", "needle");
  await write(".git/private.md", "needle");
  await write("binary.dat", Buffer.from([0, 1, 2]));
  await fs.symlink(path.join(root, "root.md"), path.join(root, "linked.md"));
  const result = await searchWorkspace(
    workspace,
    request("needle", { include: "**/*.md", exclude: "src/**" }),
  );
  assert.deepEqual(
    result.matches.map((hit) => hit.path),
    ["root.md"],
  );
  assert.equal(pathFilter("*.md", "nested/a.md"), true);
  assert.equal(pathFilter("src/**, *.json", "src/a/b.ts"), true);
  assert.equal(pathFilter("a?.md", "ab.md"), true);
  assert.equal(pathFilter("*.md", "a.md.js"), false);
});
test("workspace search prefers unsaved buffers including an empty buffer", async (t) => {
  const { write, workspace } = await fixture(t);
  await write("a.md", "disk needle");
  await write("b.md", "disk needle");
  const result = await searchWorkspace(
    workspace,
    request("needle", {
      overlays: [
        { path: "a.md", text: "unsaved needle" },
        { path: "b.md", text: "" },
      ],
    }),
  );
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].preview, "unsaved needle");
  await assert.rejects(
    searchWorkspace(
      workspace,
      request("x", { overlays: [{ path: "../outside.md", text: "x" }] }),
    ),
    /outside/,
  );
});
test("workspace search is cancellable and explicitly limits broad result sets", async (t) => {
  const { write, workspace } = await fixture(t);
  await write("a.md", "needle\n".repeat(600));
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (await searchWorkspace(workspace, request("needle"), controller.signal))
      .cancelled,
    true,
  );
  const result = await searchWorkspace(workspace, request("needle"));
  assert.equal(result.matches.length, 500);
  assert.equal(result.truncated, true);
  await assert.rejects(
    searchWorkspace(workspace, request("x".repeat(1001))),
    /Invalid/,
  );
});
test("literal matching handles regex punctuation, case and Unicode word boundaries", () => {
  assert.deepEqual(
    textMatches("[a] [A] a", { query: "[a]" }).map((hit) => hit.from),
    [0, 4],
  );
  assert.equal(
    textMatches("Café café caféine", { query: "café", wholeWord: true }).length,
    2,
  );
  assert.equal(
    textMatches("Café café", { query: "café", caseSensitive: true }).length,
    1,
  );
});
