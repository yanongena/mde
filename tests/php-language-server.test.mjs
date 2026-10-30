import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PhpLanguageServer } from "../electron/php-language-server.mjs";
import { Workspace } from "../electron/workspace.mjs";
const fixturePath = fileURLToPath(
  new URL("./fixtures/phpactor-stdio.mjs", import.meta.url),
);

test("Phpactor protocol syncs dirty project documents, UTF-16 positions and fragmented responses; stops its child", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "margin-lsp-"));
  const workspace = new Workspace(root, { blocked: [] });
  await fs.writeFile(path.join(root, "index.php"), "<?php // disk");
  await fs.writeFile(
    path.join(root, "functions.php"),
    "<?php function disk() {}",
  );
  let child;
  const server = new PhpLanguageServer(
    (_command, _args, options) =>
      (child = spawn(process.execPath, [fixturePath], options)),
  );
  t.after(async () => {
    server.stop();
    await fs.rm(root, { recursive: true, force: true });
  });
  const text = "<?php\r\n/* 😊 */ $x->";
  const request = {
    path: "index.php",
    method: "completion",
    pos: text.replace(/\r\n/g, "\n").length,
    overlays: [
      { path: "index.php", text },
      { path: "functions.php", text: "<?php function unsaved($name) {}" },
    ],
  };
  let result = await server.query(workspace, "phpactor", request);
  assert.equal(result.items[0].label, "méthode");
  const detail = JSON.parse(result.items[0].detail);
  assert.equal(detail.position.line, 1);
  assert.equal(detail.position.character, 13);
  assert.ok(
    detail.documents.some(
      ([uri, content]) =>
        uri.endsWith("functions.php") && content.includes("unsaved"),
    ),
  );
  request.overlays = [{ path: "index.php", text: "<?php $x->" }];
  request.pos = 10;
  result = await server.query(workspace, "phpactor", request);
  assert.equal(JSON.parse(result.items[0].detail).documents.length, 1);
  request.method = "signatureHelp";
  result = await server.query(workspace, "phpactor", request);
  assert.equal(result.activeParameter, 1);
  assert.equal(server.info().status, "ready");
  server.stop();
  await new Promise((resolve) =>
    child.exitCode !== null || child.signalCode !== null
      ? resolve()
      : child.once("exit", resolve),
  );
  assert.equal(server.info().status, "off");
  assert.equal(server.pending.size, 0);
});

test("missing Phpactor reports an error without hanging and rejects invalid paths before launch", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "margin-lsp-error-"));
  const workspace = new Workspace(root, { blocked: [] });
  await fs.writeFile(path.join(root, "index.php"), "<?php");
  const server = new PhpLanguageServer();
  t.after(async () => {
    server.stop();
    await fs.rm(root, { recursive: true, force: true });
  });
  await assert.rejects(
    server.query(workspace, "phpactor", {
      path: "../escape.php",
      method: "completion",
      pos: 0,
      overlays: [],
    }),
    /outside|relative/,
  );
  await assert.rejects(
    server.start(workspace, "margin-nonexistent-phpactor"),
    /Cannot start Phpactor/,
  );
  assert.equal(server.info().status, "error");
  assert.equal(server.pending.size, 0);
});
