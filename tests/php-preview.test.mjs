import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Workspace } from "../electron/workspace.mjs";
import { PhpPreview } from "../electron/php-preview.mjs";

const phpInstalled = [
  "php",
  ...(process.platform === "darwin"
    ? ["/opt/homebrew/bin/php", "/usr/local/bin/php"]
    : []),
].some(
  (executable) =>
    spawnSync(executable, ["-v"], { windowsHide: true }).status === 0,
);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "margin-php-test-"));
  const server = new PhpPreview();
  t.after(async () => {
    await server.stop();
    await fs.rm(root, { recursive: true, force: true });
  });
  const workspace = new Workspace(root, { blocked: [] });
  await fs.mkdir(path.join(root, "lesson"));
  await fs.writeFile(
    path.join(root, "lesson", "index.php"),
    '<?php require "value.php"; echo "<h1>" . $value . "</h1>";',
  );
  await fs.writeFile(
    path.join(root, "lesson", "value.php"),
    '<?php $value = "Original";',
  );
  return { root, server, workspace };
}

test(
  "PHP preview serves unsaved project buffers and includes without changing originals, then stops and removes its copy",
  { skip: !phpInstalled },
  async (t) => {
    const { root, server, workspace } = await fixture(t);
    const original = await fs.readFile(
      path.join(root, "lesson", "index.php"),
      "utf8",
    );
    let result = await server.render(workspace, {
      path: "lesson/index.php",
      overlays: [
        { path: "lesson/value.php", text: '<?php $value = "Unsaved include";' },
        {
          path: "lesson/index.php",
          text: '<?php require "value.php"; file_put_contents("generated.txt", "preview only"); echo "<h1>" . $value . "</h1>";',
        },
      ],
    });
    assert.equal(result.status, 200);
    assert.equal(result.html, "<h1>Unsaved include</h1>");
    assert.match(result.url, /^http:\/\/127\.0\.0\.1:\d+\/lesson\/index\.php$/);
    assert.equal(
      await fs.readFile(path.join(root, "lesson", "index.php"), "utf8"),
      original,
    );
    await assert.rejects(fs.stat(path.join(root, "lesson", "generated.txt")), {
      code: "ENOENT",
    });
    const temporary = server.temporary;
    const child = server.child;
    // Removing a dirty overlay must restore the saved version in the copy.
    result = await server.render(workspace, {
      path: "lesson/index.php",
      overlays: [],
    });
    assert.equal(result.html, "<h1>Original</h1>");
    await server.stop();
    await assert.rejects(fs.stat(temporary), { code: "ENOENT" });
    assert.notEqual(child.signalCode, null);
    await assert.rejects(fetch(result.url));
  },
);

test(
  "PHP preview executes PHTML and reports syntax errors, and a new workspace replaces the old server",
  { skip: !phpInstalled },
  async (t) => {
    const { root, server, workspace } = await fixture(t);
    await fs.writeFile(
      path.join(root, "lesson", "page.phtml"),
      "<h1><?= 6 * 7 ?></h1>",
    );
    const result = await server.render(workspace, {
      path: "lesson/page.phtml",
      overlays: [],
    });
    assert.equal(result.html, "<h1>42</h1>");
    const failed = await server.render(workspace, {
      path: "lesson/page.phtml",
      overlays: [{ path: "lesson/page.phtml", text: "<?php if (" }],
    });
    assert.match(failed.html, /Parse error/);
    const oldCopy = server.temporary;
    const secondRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "margin-php-next-"),
    );
    t.after(() => fs.rm(secondRoot, { recursive: true, force: true }));
    await fs.writeFile(
      path.join(secondRoot, "index.php"),
      '<?php echo "Next workspace";',
    );
    const next = await server.render(
      new Workspace(secondRoot, { blocked: [] }),
      { path: "index.php", overlays: [] },
    );
    assert.equal(next.html, "Next workspace");
    await assert.rejects(fs.stat(oldCopy), { code: "ENOENT" });
  },
);

test("PHP preview refuses escaped paths, symlinks, invalid buffers and oversized project copies", async (t) => {
  const { root, server, workspace } = await fixture(t);
  await assert.rejects(
    server.render(workspace, { path: "../escape.php", overlays: [] }),
    /outside/,
  );
  await assert.rejects(
    server.render(workspace, {
      path: "lesson/index.php",
      overlays: [{ path: "lesson/value.php", text: 123 }],
    }),
    /buffer/,
  );
  await fs.symlink(
    path.join(root, "lesson/index.php"),
    path.join(root, "linked.php"),
  );
  await assert.rejects(
    server.render(workspace, { path: "linked.php", overlays: [] }),
    /Symbolic/,
  );
  const large = await fs.open(path.join(root, "large.bin"), "w");
  await large.truncate(64 * 1024 * 1024 + 1);
  await large.close();
  await assert.rejects(
    server.render(workspace, { path: "lesson/index.php", overlays: [] }),
    /64 MB/,
  );
  assert.equal(server.child, undefined);
  assert.equal(server.temporary, undefined);
});

test("stopping PHP preview aborts a running request and queued executions", { skip: !phpInstalled }, async (t) => {
  const { root, server, workspace } = await fixture(t);
  const started = await server.render(workspace, { path: "lesson/index.php", overlays: [] });
  const slow = server.render(workspace, { path: "lesson/index.php", overlays: [{ path: "lesson/index.php", text: '<?php file_put_contents("started.txt", "yes"); sleep(20); echo "Late result";' }] });
  // Attach handlers immediately, before stop rejects either request.
  const finished = assert.rejects(slow);
  const queued = assert.rejects(server.render(workspace, { path: "lesson/index.php", overlays: [] }), /stopped/);
  const marker = path.join(server.directory, "lesson", "started.txt");
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await fs.access(marker).then(() => true, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(await fs.readFile(marker, "utf8"), "yes");
  const begin = Date.now();
  await server.stop();
  await finished;
  await queued;
  assert.ok(Date.now() - begin < 2000, "Stop should not wait for PHP's sleep to finish");
  await assert.rejects(fetch(started.url));
  await assert.rejects(fs.stat(path.join(root, "lesson", "started.txt")), { code: "ENOENT" });
});
