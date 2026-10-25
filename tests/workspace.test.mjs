import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Workspace } from "../electron/workspace.mjs";
import { Transactions } from "../electron/transactions.mjs";
import { hash, writeJSON, exists } from "../electron/storage.mjs";

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "margin-unit-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "workspace");
  await fs.mkdir(root);
  const tx = new Transactions(path.join(base, "recovery"));
  await tx.recover();
  const workspace = new Workspace(root, tx);
  const write = async (name, text = "") => {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), text);
  };
  const read = (name) => fs.readFile(path.join(root, name), "utf8");
  return { root, base, tx, workspace, write, read };
}
test("create, nested tree, duplicate and optimistic saves use real files", async (t) => {
  const { workspace: w, read, write } = await fixture(t);
  await w.create("notes", true);
  await w.create("notes/first.md");
  let doc = await w.read("notes/first.md");
  const save = await w.save(doc.path, "# First\n", doc.revision);
  assert.equal(save.conflict, false);
  await write("notes/first.md", "# External\n");
  const conflict = await w.save(doc.path, "# Mine\n", save.revision);
  assert.equal(conflict.conflict, true);
  assert.equal(await read(doc.path), "# External\n");
  await w.duplicate("notes/first.md", "copy.md");
  assert.equal(await read("copy.md"), "# External\n");
  assert.equal((await w.tree()).length, 3);
  await assert.rejects(w.create("copy.md"), /exist/);
});
test("moving images and notes updates references across unopened documents", async (t) => {
  const { workspace: w, write, read } = await fixture(t);
  await write("notes/a.md", "# A\n\n![image](../assets/pic.png)\n[b](b.md#hi)");
  await write("notes/b.md", "[a](a.md)");
  await write("index.md", "[a](notes/a.md)");
  await write("assets/pic.png", "image");
  await w.create("archive", true);
  await w.move("assets/pic.png", "assets/new image.png");
  assert.match(await read("notes/a.md"), /new%20image\.png/);
  await w.move("assets", "archive/assets");
  assert.match(
    await read("notes/a.md"),
    /\.\.\/archive\/assets\/new%20image\.png/,
  );
  await w.move("notes/a.md", "archive/a.md");
  assert.equal(await read("index.md"), "[a](archive/a.md)");
  assert.equal(await read("notes/b.md"), "[a](../archive/a.md)");
  assert.match(
    await read("archive/a.md"),
    /!\[image\]\(assets\/new%20image\.png\)/,
  );
  assert.match(await read("archive/a.md"), /\[b\]\(\.\.\/notes\/b\.md#hi\)/);
});
test("injected write failure rolls back both file move and link edits", async (t) => {
  const { workspace: w, write, read, root, tx } = await fixture(t);
  await write("a.md", "A");
  await write("index.md", "[a](a.md)");
  await assert.rejects(
    w.move("a.md", "b.md", () => {
      throw new Error("injected failure");
    }),
    /injected/,
  );
  assert.equal(await exists(path.join(root, "a.md")), true);
  assert.equal(await exists(path.join(root, "b.md")), false);
  assert.equal(await read("index.md"), "[a](a.md)");
  assert.equal(tx.blocked.length, 0);
});
test("move collision, root escape, reserved names, and move into itself are refused", async (t) => {
  const { workspace: w, write, read } = await fixture(t);
  await write("a.md", "A");
  await write("b.md", "B");
  await w.create("dir", true);
  await assert.rejects(w.move("a.md", "b.md"), /exists/);
  assert.equal(await read("b.md"), "B");
  for (const invalid of ["../evil.md", "C:/evil.md", "../a", "folder/../../a"])
    await assert.rejects(w.create(invalid));
  for (const invalid of ["CON.md", "trailing.", "bad?.md"])
    await assert.rejects(w.create(invalid), /valid/);
  await assert.rejects(w.move("dir", "dir/nested"), /itself/);
});
test("ignored files and symbolic links are not traversed", async (t) => {
  const { workspace: w, write, root } = await fixture(t);
  await write("node_modules/a.md", "ignored");
  await write("notes/a.md", "visible");
  assert.deepEqual(
    (await w.tree()).map((e) => e.path),
    ["notes", "notes/a.md"],
  );
  await fs.symlink(
    path.join(root, "notes"),
    path.join(root, "link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.equal(
    (await w.tree()).some((e) => e.path === "link"),
    false,
  );
  await assert.rejects(w.read("link/a.md"), /Symbolic/);
});
test("image attachment settings use portable paths and unique on-disk names", async (t) => {
  const { workspace: w, write, root } = await fixture(t);
  await write("notes/a.md", "");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
    "base64",
  );
  const a = await w.attachment("notes/a.md", png, "screenshot.png", {
    attachmentMode: "workspace",
    attachmentFolder: "shared media",
  });
  const b = await w.attachment("notes/a.md", png, "screenshot.png", {
    attachmentMode: "nearby",
    attachmentFolder: "images",
  });
  const c = await w.attachment("notes/a.md", png, "screenshot.png", {
    attachmentMode: "nearby",
    attachmentFolder: "images",
  });
  assert.match(a.url, /^\.\.\/shared%20media\//);
  assert.match(b.url, /^images\//);
  assert.notEqual(b.path, c.path);
  assert.deepEqual(await fs.readFile(path.join(root, a.path)), png);
  await assert.rejects(
    w.attachment("notes/a.md", Buffer.from("<svg/>"), "bad.svg", {}),
    /PNG/,
  );
  await assert.rejects(
    w.attachment("notes/a.md", png, "a.png", { attachmentFolder: "../../out" }),
  );
});
test("durable recovery restores an interrupted transaction, never overwrites later external edits", async (t) => {
  const { root, base, write, read } = await fixture(t);
  await write("b.md", "A");
  await write("index.md", "[a](b.md)");
  const record = {
    state: "prepared",
    from: path.join(root, "a.md"),
    to: path.join(root, "b.md"),
    edits: [
      {
        beforePath: path.join(root, "index.md"),
        afterPath: path.join(root, "index.md"),
        before: Buffer.from("[a](a.md)").toString("base64"),
        beforeHash: hash("[a](a.md)"),
        afterHash: hash("[a](b.md)"),
      },
    ],
  };
  const directory = path.join(base, "recover2");
  await writeJSON(path.join(directory, "crash.json"), record);
  const recovered = new Transactions(directory);
  assert.deepEqual(await recovered.recover(), []);
  assert.equal(await read("a.md"), "A");
  assert.equal(await read("index.md"), "[a](a.md)");
  await fs.rename(path.join(root, "a.md"), path.join(root, "b.md"));
  await write("index.md", "External newer change");
  await writeJSON(path.join(directory, "crash2.json"), record);
  assert.equal((await recovered.recover()).length, 1);
  assert.equal(await read("index.md"), "External newer change");
  await assert.rejects(
    new Workspace(root, recovered).create("blocked.md"),
    /Recovery/,
  );
});
test("duplicated notes recalculate outgoing relative links without altering originals", async (t) => {
  const { workspace: w, write, read } = await fixture(t);
  await write("notes/a.md", "[x](../x.md)");
  await write("x.md", "X");
  await w.create("archive", true);
  await w.duplicate("notes/a.md", "archive/copy.md");
  assert.equal(await read("archive/copy.md"), "[x](../x.md)");
  assert.equal(await read("notes/a.md"), "[x](../x.md)");
});
test("UTF-8 BOM and CRLF survive saves; binary and invalid UTF-8 are refused", async (t) => {
  const { workspace: w, write } = await fixture(t);
  const original = "\uFEFF# Hello\r\n";
  await write("bom.md", original);
  const doc = await w.read("bom.md");
  assert.equal(doc.text, original);
  await w.save(doc.path, doc.text, doc.revision);
  assert.equal((await w.read(doc.path)).text, original);
  await write("bad.txt", Buffer.from([255, 254, 65, 66]));
  await assert.rejects(w.read("bad.txt"), /UTF-8/);
  await write("binary.bin", Buffer.from([0, 1, 2]));
  await assert.rejects(w.read("binary.bin"), /binary/);
});
