import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { Workspace } from "../electron/workspace.mjs";
import { isBrowserFile } from "../electron/browser-files.mjs";
import { openInBrowser } from "../electron/browser.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "margin-browser-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, workspace: new Workspace(root) };
}

test("browser formats include documents, images and media, with case-insensitive extensions", () => {
  for (const name of [
    "index.html",
    "index.HTM",
    "page.xhtml",
    "report.PDF",
    "photo.jpg",
    "photo.PNG",
    "icon.svg",
    "photo.avif",
    "data.json",
    "data.xml",
    "readme.txt",
    "song.mp3",
    "clip.webm",
  ])
    assert.equal(isBrowserFile(name), true, name);
  for (const name of [
    "",
    "notes.md",
    "archive.zip",
    "setup.exe",
    "script.ps1",
    "photo.png.exe",
    "folder",
    null,
  ])
    assert.equal(isBrowserFile(name), false, String(name));
});

test("browser opening uses the HTTPS handler and an encoded local URL for the original file", async (t) => {
  const { root, workspace } = await fixture(t);
  const browser = path.join(root, "Default browser");
  const calls = [];
  const app = {
    async getApplicationInfoForProtocol(protocol) {
      assert.equal(protocol, "https://");
      return { path: browser };
    },
  };
  for (const name of [
    "page # é %.HTML",
    "image.png",
    "report.pdf",
    "clip.mp4",
  ]) {
    await fs.writeFile(path.join(root, name), Buffer.from([0, 1, 2]));
    await openInBrowser(workspace, name, app, async (...args) =>
      calls.push(args),
    );
    assert.deepEqual(calls.at(-1), [
      browser,
      pathToFileURL(path.join(root, name)).href,
    ]);
    assert.deepEqual(
      await fs.readFile(path.join(root, name)),
      Buffer.from([0, 1, 2]),
    );
  }
});

test("browser opening rejects directories, unsupported files, missing files and workspace escapes before launching", async (t) => {
  const { root, workspace } = await fixture(t);
  await fs.mkdir(path.join(root, "folder.pdf"));
  await fs.writeFile(path.join(root, "script.exe"), "");
  const app = {
    getApplicationInfoForProtocol() {
      assert.fail("Must validate before finding a browser");
    },
  };
  for (const name of [
    "folder.pdf",
    "script.exe",
    "missing.pdf",
    "../outside.html",
    path.join(root, "absolute.html"),
    ".git/index.html",
  ])
    await assert.rejects(openInBrowser(workspace, name, app));
});

test("browser discovery and launch failures are returned to the caller", async (t) => {
  const { root, workspace } = await fixture(t);
  await fs.writeFile(path.join(root, "page.html"), "<h1>Hello</h1>");
  await assert.rejects(
    openInBrowser(workspace, "page.html", {
      async getApplicationInfoForProtocol() {
        throw new Error("No browser registered");
      },
    }),
    /No browser registered/,
  );
  await assert.rejects(
    openInBrowser(workspace, "page.html", {
      async getApplicationInfoForProtocol() {
        return { path: "" };
      },
    }),
    /No default browser/,
  );
  const app = {
    async getApplicationInfoForProtocol() {
      return { path: path.join(root, "missing-browser") };
    },
  };
  await assert.rejects(openInBrowser(workspace, "page.html", app));
});
