import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { moveProblem } from "../src/lib/explorer-move.ts";
import { Workspace } from "../electron/workspace.mjs";
import { Transactions } from "../electron/transactions.mjs";

test("explorer move destinations reject self, descendants, collisions and no-ops", () => {
  const entries = ["notes", "notes/sub", "notes-other", "archive"].map(
    (path) => ({ path, directory: true }),
  );
  entries.push({ path: "notes/a.md", directory: false });
  assert.match(moveProblem(["notes"], "notes", entries), /itself/);
  assert.match(moveProblem(["notes"], "notes/sub", entries), /subfolders/);
  assert.match(moveProblem(["notes/a.md"], "notes", entries), /Already/);
  assert.match(moveProblem(["notes"], "", entries), /Already/);
  assert.match(moveProblem(["notes"], "missing", entries), /existing/);
  assert.equal(moveProblem(["notes"], "notes-other", entries), "");
  assert.equal(moveProblem(["notes/a.md"], "", entries), "");
  assert.equal(moveProblem(["notes"], "archive", entries), "");
  entries.push({ path: "archive/NOTES", directory: true });
  assert.match(moveProblem(["notes"], "archive", entries), /already exists/);
  assert.match(
    moveProblem(["notes/a.md", "other/A.md"], "archive", entries),
    /already exists/,
  );
});

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "margin-folder-move-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "workspace");
  for (const folder of ["notes/sub", "assets", "archive", "node_modules"])
    await fs.mkdir(path.join(root, folder), { recursive: true });
  const files = {
    "index.md":
      "[a](notes/a.md#intro) [b][nested]\n\n[nested]: notes/sub/b.md\n",
    "notes/a.md":
      "[nested](sub/b.md) ![pic](../assets/image.png) [self](/notes/a.md#intro)\n",
    "notes/sub/b.md": "[a](../a.md) [outside](../../index.md)\n",
  };
  for (const [name, text] of Object.entries(files))
    await fs.writeFile(path.join(root, name), text);
  const bytes = Buffer.from([0, 1, 255, 42]);
  await fs.writeFile(path.join(root, "notes/sub/data.bin"), bytes);
  const tx = new Transactions(path.join(base, "recovery"));
  await tx.recover();
  return {
    root,
    w: new Workspace(root, tx),
    files,
    bytes,
    read: (name) => fs.readFile(path.join(root, name), "utf8"),
  };
}

test("moving a folder selection relocates descendants and updates incoming, outgoing and internal links", async (t) => {
  const { w, root, bytes, read } = await fixture(t);
  const result = await w.moveSelection(["notes", "notes/a.md"], "archive");
  assert.deepEqual(result.moves, [{ from: "notes", to: "archive/notes" }]);
  assert.equal(
    await read("index.md"),
    "[a](archive/notes/a.md#intro) [b][nested]\n\n[nested]: archive/notes/sub/b.md\n",
  );
  assert.equal(
    await read("archive/notes/a.md"),
    "[nested](sub/b.md) ![pic](../../assets/image.png) [self](/archive/notes/a.md#intro)\n",
  );
  assert.equal(
    await read("archive/notes/sub/b.md"),
    "[a](../a.md) [outside](../../../index.md)\n",
  );
  assert.deepEqual(
    await fs.readFile(path.join(root, "archive/notes/sub/data.bin")),
    bytes,
  );
  await assert.rejects(fs.stat(path.join(root, "notes")), { code: "ENOENT" });
  await w.moveSelection(["archive/notes"], "");
  assert.equal(
    await read("index.md"),
    "[a](notes/a.md#intro) [b][nested]\n\n[nested]: notes/sub/b.md\n",
  );
});

test("failed folder moves restore every path and reference; ignored destinations are refused", async (t) => {
  const { w, files, root, read } = await fixture(t);
  await assert.rejects(w.moveSelection(["notes"], "node_modules"), /ignored/);
  await assert.rejects(w.moveSelection(["notes"], "node_modules\\"), /ignored/);
  await assert.rejects(w.moveSelection(["notes"], "notes/sub"), /inside/);
  await assert.rejects(
    w.moveSelection(["notes"], "archive", () => {
      throw new Error("injected");
    }),
    /injected/,
  );
  for (const [name, text] of Object.entries(files))
    assert.equal(await read(name), text);
  await assert.rejects(fs.stat(path.join(root, "archive/notes")), {
    code: "ENOENT",
  });
});
