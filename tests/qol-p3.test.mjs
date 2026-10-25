import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { FileHistory } from "../electron/history.mjs";
import { Workspace } from "../electron/workspace.mjs";
import { Transactions } from "../electron/transactions.mjs";
import { hash, writeJSON } from "../electron/storage.mjs";
import { selectionRoots } from "../electron/selection.mjs";
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "margin-p3-unit-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "Workspace");
  await fs.mkdir(root);
  await fs.mkdir(path.join(root, "notes"));
  await fs.mkdir(path.join(root, "archive"));
  const tx = new Transactions(path.join(base, "recovery"));
  await tx.recover();
  const w = new Workspace(root, tx);
  const write = (name, text) => fs.writeFile(path.join(root, name), text),
    read = (name) => fs.readFile(path.join(root, name), "utf8");
  return { base, root, w, tx, write, read };
}
test("P3 history saves earlier bytes only on successful revisions, isolates workspaces and retains restore checkpoints", async (t) => {
  const { base, root, w, write, read } = await fixture(t);
  const history = new FileHistory(path.join(base, "history"));
  w.history = history;
  const original = "\uFEFF# Original\r\n";
  await write("notes/a.md", original);
  let doc = await w.read("notes/a.md");
  await w.save(doc.path, "# Second\n", doc.revision);
  let versions = await history.list(root, doc.path);
  assert.equal(versions.length, 1);
  assert.equal(await history.read(root, doc.path, versions[0].id), original);
  await assert.rejects(history.read(root, "notes/else.md", versions[0].id));
  await assert.rejects(history.read(root + "/other", doc.path, versions[0].id));
  await assert.rejects(history.read(root, doc.path, "../../state"));
  const rejected = await w.save(doc.path, "bad", doc.revision);
  assert.equal(rejected.conflict, true);
  assert.equal((await history.list(root, doc.path)).length, 1);
  assert.equal(await read(doc.path), "# Second\n");
  await history.capture(
    root,
    doc.path,
    "# Dirty editor\n",
    "Before restoring (editor contents)",
  );
  versions = await history.list(root, doc.path);
  assert.equal(versions[0].reason, "Before restoring (editor contents)");
  assert.equal(
    await history.read(root, doc.path, versions[0].id),
    "# Dirty editor\n",
  );
  await history.remap(root, [{ from: "notes", to: "archive/notes" }]);
  assert.equal((await history.list(root, "archive/notes/a.md")).length, 2);
  const restarted = new FileHistory(path.join(base, "history"));
  assert.equal((await restarted.list(root, "archive/notes/a.md")).length, 2);
});
test("P3 history enforces file/global limits, removes orphan blobs and preserves existing versions when disabled", async (t) => {
  const { base, root } = await fixture(t);
  let settings = {
    historyVersions: 2,
    historyLimitMB: 1,
    historyEnabled: true,
  };
  const history = new FileHistory(path.join(base, "history"), () => settings);
  await history.capture(root, "a.md", "a");
  await history.capture(root, "a.md", "b");
  await history.capture(root, "a.md", "c");
  let list = await history.list(root, "a.md");
  assert.equal(list.length, 2);
  assert.equal(await history.read(root, "a.md", list[1].id), "b");
  await history.capture(root, "b.md", "x".repeat(700_000));
  await history.capture(root, "c.md", "y".repeat(700_000));
  assert.equal((await history.list(root, "b.md")).length, 0);
  const orphan = randomUUID() + ".txt";
  await fs.writeFile(path.join(base, "history", orphan), "orphan");
  await history.prune();
  await assert.rejects(fs.stat(path.join(base, "history", orphan)));
  settings = { ...settings, historyEnabled: false };
  await history.capture(root, "a.md", "not recorded");
  assert.equal((await history.list(root, "a.md")).length, 2);
  assert.equal((await history.list(root, "c.md")).length, 1);
  settings = { ...settings, historyEnabled: true };
  list = await history.list(root, "c.md");
  await fs.writeFile(
    path.join(base, "history", list[0].id + ".txt"),
    "tampered",
  );
  await assert.rejects(history.read(root, "c.md", list[0].id), /damaged/);
});
test("P3 parent-child selections collapse to roots and invalid batches are refused", () => {
  assert.deepEqual(
    selectionRoots(["notes/a.md", "notes", "notes", "other.md"]),
    ["notes", "other.md"],
  );
  assert.throws(() => selectionRoots([""]));
  assert.throws(() =>
    selectionRoots(Array.from({ length: 101 }, (_, i) => String(i))),
  );
});
test("P3 batch move updates references among moved and unopened notes once and checks incoming selection references", async (t) => {
  const { w, write, read } = await fixture(t);
  await write("notes/a.md", "[b](b.md#hi)\n");
  await write("notes/b.md", "[a](a.md)\n");
  await write("index.md", "[a](notes/a.md) [b](notes/b.md)\n");
  assert.deepEqual(await w.incomingSelection(["notes/a.md", "notes/b.md"]), [
    "index.md",
  ]);
  const result = await w.moveSelection(["notes/a.md", "notes/b.md"], "archive");
  assert.equal(result.moves.length, 2);
  assert.equal(await read("archive/a.md"), "[b](b.md#hi)\n");
  assert.equal(await read("archive/b.md"), "[a](a.md)\n");
  assert.equal(await read("index.md"), "[a](archive/a.md) [b](archive/b.md)\n");
});
test("P3 batch preflight is all-or-nothing and injected failures restore all original paths and bytes", async (t) => {
  const { w, write, read } = await fixture(t);
  await write("notes/a.md", "[b](b.md)");
  await write("notes/b.md", "# B");
  await write("archive/b.md", "collision");
  await assert.rejects(
    w.moveSelection(["notes/a.md", "notes/b.md"], "archive"),
    /destination/,
  );
  assert.equal(await read("notes/a.md"), "[b](b.md)");
  await assert.rejects(read("archive/a.md"));
  await fs.rm(path.join(w.root, "archive/b.md"));
  let n = 0;
  await assert.rejects(
    w.moveSelection(["notes/a.md", "notes/b.md"], "archive", () => {
      if (++n === 1) throw new Error("injected");
    }),
    /injected/,
  );
  assert.equal(await read("notes/a.md"), "[b](b.md)");
  assert.equal(await read("notes/b.md"), "# B");
  await assert.rejects(read("archive/a.md"));
  await write("archive/A.md", "case collision");
  await assert.rejects(
    w.moveSelection(["notes/a.md", "archive/A.md"], ""),
    /same name/,
  );
  await assert.rejects(read("a.md"));
  assert.equal(await read("notes/a.md"), "[b](b.md)");
  assert.equal(await read("archive/A.md"), "case collision");
  await assert.rejects(w.moveSelection(["notes"], "notes"), /inside/);
  await assert.rejects(w.moveSelection(["notes/a.md"], "../"));
});
test("P3 startup recovers a partially completed batch journal and leaves later external edits untouched", async (t) => {
  const { base, root, write, read } = await fixture(t);
  const original = "[a](notes/a.md)";
  await write("notes/a.md", "# A");
  await write("notes/b.md", "# B");
  await write("index.md", original);
  const record = {
    id: randomUUID(),
    state: "prepared",
    moves: [
      {
        from: path.join(root, "notes/a.md"),
        to: path.join(root, "archive/a.md"),
      },
      {
        from: path.join(root, "notes/b.md"),
        to: path.join(root, "archive/b.md"),
      },
    ],
    edits: [
      {
        beforePath: path.join(root, "index.md"),
        afterPath: path.join(root, "index.md"),
        before: Buffer.from(original).toString("base64"),
        beforeHash: hash(original),
        afterHash: hash("[a](archive/a.md)"),
      },
    ],
  };
  await writeJSON(path.join(base, "recovery", record.id + ".json"), record);
  await fs.rename(record.moves[0].from, record.moves[0].to);
  const restarted = new Transactions(path.join(base, "recovery"));
  assert.deepEqual(await restarted.recover(), []);
  assert.equal(await read("notes/a.md"), "# A");
  record.id = randomUUID();
  await writeJSON(path.join(base, "recovery", record.id + ".json"), record);
  await fs.rename(record.moves[0].from, record.moves[0].to);
  await write("index.md", "external");
  const blocked = await restarted.recover();
  assert.equal(blocked.length, 1);
  assert.equal(await read("index.md"), "external");
  assert.equal(await read("archive/a.md"), "# A");
});
