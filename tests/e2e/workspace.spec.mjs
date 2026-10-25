import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let app, page, base, root, data, errors;
const shortcut = process.platform === "darwin" ? "Meta" : "Control";
const file = (name) => path.join(root, name);
async function disk(name) {
  return fs.readFile(file(name), "utf8");
}
async function open(name) {
  await page.getByRole("treeitem", { name, exact: true }).click();
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "title",
    name,
  );
}
async function settingsManual() {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Autosave policy").selectOption("off");
  await page.getByRole("button", { name: "Close preferences" }).click();
}
async function save() {
  await page.keyboard.press(shortcut + "+s");
  await expect(page.locator(".save-state")).toContainText("Saved");
}
async function sourceFill(text) {
  const content = page.locator(".editor-pane.active .cm-content");
  await content.click();
  await page.keyboard.press(shortcut + "+a");
  await page.keyboard.insertText(text);
}
async function move(from, to) {
  await page
    .getByRole("treeitem", { name: from, exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /Rename \/ move/ }).click();
  await page.getByLabel("New path", { exact: true }).fill(to);
  await page.getByRole("button", { name: "Move & update links" }).click();
  await expect(
    page.getByRole("dialog", { name: "Rename or move" }),
  ).toHaveCount(0);
  if (
    await page.getByRole("dialog", { name: "Save your work first" }).isVisible()
  )
    await page
      .getByRole("button", { name: "Save all & continue", exact: true })
      .click();
  await expect(
    page.getByRole("treeitem", { name: to, exact: true }),
  ).toBeVisible();
}
async function launch(devURL) {
  const env = {
    ...process.env,
    MARGIN_DATA_PATH: data,
    MARGIN_WORKSPACE: root,
    ...(devURL ? { MARGIN_DEV_URL: devURL } : {}),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(process.env.MARGIN_TEST_EXECUTABLE
      ? { executablePath: process.env.MARGIN_TEST_EXECUTABLE, args: [] }
      : { args: ["."] }),
    cwd: process.cwd(),
    env,
  });
  page = await app.firstWindow();
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("treeitem", { name: "notes/welcome.md", exact: true }),
  ).toBeVisible();
}
test.beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "margin-e2e-"));
  root = path.join(base, "Workspace");
  data = path.join(base, "data");
  await fs.mkdir(path.join(root, "notes"), { recursive: true });
  await fs.mkdir(path.join(root, "assets"));
  await fs.mkdir(path.join(root, "archive"));
  await fs.mkdir(path.join(root, "src"));
  const fixtures = {
    "notes/welcome.md":
      '# A quieter workspace\n\nWords and work, together.\n\n- [ ] Write something worth keeping\n- [x] Open your workspace\n\n## Small beginnings\n\nA place for **ideas**, `code`, and everything between.\n\n```python\ndef hello(name):\n    return f"Hello, {name}"\n```\n',
    "notes/other.md": "# Other\n\n[Welcome](welcome.md#small-beginnings)\n",
    "index.md": "[Welcome](notes/welcome.md)\n",
    "src/example.py": 'def greet(name):\n    return f"Hello {name}"\n',
    "src/example.php":
      '<?php\nfunction greet($name) { return "Hello " . $name; }\n',
    "src/example.js": "const greet = (name) => `Hello ${name}`;\n",
    "src/example.ts": "const count: number = 42;\n",
    "src/example.html":
      "<!doctype html>\n<html><body><h1>Hello</h1></body></html>\n",
    "src/example.css": "body { color: green; margin: 0; }\n",
    "src/example.json": '{"hello": true}\n',
    "src/example.yaml": "hello: true\n",
    "src/example.sh": '#!/bin/bash\necho "hello"\n',
    "src/example.sql": "SELECT id FROM notes WHERE active = 1;\n",
    "src/example.cs": "public class Hello { public int Count = 1; }\n",
    "src/example.xml": '<?xml version="1.0"?><hello>world</hello>\n',
  };
  for (const [name, content] of Object.entries(fixtures))
    await fs.writeFile(file(name), content);
  await launch();
  await settingsManual();
});

test("development server renders the real application", async () => {
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  const { createServer } = await import("vite");
  const server = await createServer({ server: { port: 5174 } });
  await server.listen();
  try {
    await launch("http://127.0.0.1:5174");
    await open("notes/welcome.md");
    await expect(page.locator(".editor-pane.active h1")).toHaveText(
      "A quieter workspace",
    );
    expect(errors).toEqual([]);
  } finally {
    await server.close();
  }
});
test.afterEach(async () => {
  if (app) {
    await app.evaluate(({ app }) => app.exit()).catch(() => {});
    await app.close().catch(() => {});
  }
  await fs.rm(base, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
});

test("visual authoring, tables, formatting, undo, source mode and repeated serialization", async () => {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "New document", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Daily.md");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const editor = page
    .getByRole("textbox", { name: "Visual Markdown editor" })
    .or(page.locator(".editor-pane.active .document-content"));
  await expect(
    page.locator(".editor-pane.active .document-content"),
  ).toBeVisible();
  const rich = page.locator(".editor-pane.active .document-content");
  await page.getByLabel("Text style").selectOption("1");
  await rich.pressSequentially("A useful daily note");
  await page.keyboard.press("Enter");
  await page.getByLabel("Text style").selectOption("0");
  await page.keyboard.insertText("Thoughts become ");
  await page
    .getByRole("button", { name: "Bold (Ctrl+B)", exact: true })
    .click();
  await page.keyboard.insertText("clearer");
  await page
    .getByRole("button", { name: "Bold (Ctrl+B)", exact: true })
    .click();
  await page.keyboard.insertText(" on paper.");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Checklist", exact: true }).click();
  await page.keyboard.insertText("Ship the first draft");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Read it again");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await expect(rich.locator("table")).toBeVisible();
  await rich.locator("th").first().click();
  await page.keyboard.insertText("Topic");
  await rich.locator("th").nth(1).click();
  await page.keyboard.insertText("Status");
  await rich.locator("td").first().click();
  await page.keyboard.insertText("Writing");
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(rich.locator("tr")).toHaveCount(4);
  await rich.click();
  await page.keyboard.press(shortcut + "+End");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  // Exit the table using the ProseMirror end-of-document shortcut, then insert code.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.getByRole("button", { name: "Code block", exact: true }).click();
  await page.keyboard.insertText('print("Hello from Margin")');
  if (await page.getByLabel("Code block language", { exact: true }).isVisible())
    await page
      .getByLabel("Code block language", { exact: true })
      .fill("python");
  await save();
  const before = await disk("Daily.md");
  expect(before).toContain("# A useful daily note");
  expect(before).toContain("**clearer**");
  expect(before).toContain("- [ ] Ship the first draft");
  expect(before).toContain("| Topic");
  expect(before).toContain("Hello from Margin");
  await page.getByRole("button", { name: "Markdown source mode" }).click();
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "# A useful daily note",
  );
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect(rich.locator("h1")).toHaveText("A useful daily note");
  const checkbox = rich.locator("input[type=checkbox]").first();
  await checkbox.check();
  await save();
  expect(await disk("Daily.md")).toContain("- [x] Ship the first draft");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(checkbox).toBeChecked();
  await save();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Markdown source mode" }).click();
    await page
      .getByRole("button", { name: "Visual mode", exact: true })
      .click();
  }
  await expect(rich.locator("h1")).toHaveText("A useful daily note");
  await expect(rich.locator("table")).toHaveCount(1);
  await page.getByRole("button", { name: "Close Daily.md" }).click();
  await open("Daily.md");
  await expect(rich.locator("h1")).toHaveText("A useful daily note");
  await expect(checkbox).toBeChecked();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/visual-authoring.png" });
});

test("native clipboard image, file insertion, image/folder/note moves and cross-note links", async () => {
  await open("notes/welcome.md");
  await app.evaluate(async ({ clipboard, nativeImage, ClipboardItem }) => {
    const rgba = Buffer.alloc(64 * 40 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 115;
      rgba[i + 1] = 160;
      rgba[i + 2] = 92;
      rgba[i + 3] = 255;
    }
    const png = nativeImage
      .createFromBitmap(rgba, { width: 64, height: 40 })
      .toPNG();
    await clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([png], { type: "image/png" }),
      }),
    ]);
  });
  const rich = page.locator(".editor-pane.active .document-content");
  await rich.click();
  await page.keyboard.press(shortcut + "+End");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press(shortcut + "+v");
  await expect(rich.locator("img[src]")).toHaveCount(1);
  await expect
    .poll(() =>
      rich
        .locator("img[src]")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await save();
  const images = (await fs.readdir(file("assets"))).filter((n) =>
    n.endsWith(".png"),
  );
  expect(images).toHaveLength(1);
  const old = "assets/" + images[0];
  expect(await disk("notes/welcome.md")).toContain("../assets/");
  await move(old, "assets/renamed screenshot.png");
  expect(await disk("notes/welcome.md")).toContain(
    "../assets/renamed%20screenshot.png",
  );
  await expect
    .poll(() =>
      page
        .locator(".editor-pane.active img[src]")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await move("assets/renamed screenshot.png", "archive/screenshot.png");
  expect(await disk("notes/welcome.md")).toContain("../archive/screenshot.png");
  await move("notes/welcome.md", "archive/welcome.md");
  expect(await disk("notes/other.md")).toContain(
    "../archive/welcome.md#small-beginnings",
  );
  expect(await disk("index.md")).toContain("archive/welcome.md");
  expect(await disk("archive/welcome.md")).toContain("screenshot.png");
  await move("archive", "knowledge");
  expect(await disk("notes/other.md")).toContain("../knowledge/welcome.md");
  expect(await disk("index.md")).toContain("knowledge/welcome.md");
  await expect(page.locator(".editor-pane.active img[src]")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("all requested code languages highlight, edit/save, search/replace, diagnostics and external changes", async () => {
  for (const ext of [
    "py",
    "php",
    "js",
    "ts",
    "html",
    "css",
    "json",
    "yaml",
    "sh",
    "sql",
    "cs",
    "xml",
  ]) {
    await open("src/example." + ext);
    const content = page.locator(".editor-pane.active .cm-content");
    await expect(content).toBeVisible();
    await expect
      .poll(() => content.locator("span[class]").count())
      .toBeGreaterThan(0);
  }
  await open("src/example.py");
  await sourceFill("def tested():\n    return 42\n");
  await save();
  expect(await disk("src/example.py")).toBe("def tested():\n    return 42\n");
  await page.keyboard.press(shortcut + "+h");
  await expect(page.locator(".editor-pane.active .cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await fs.writeFile(file("src/example.py"), "# Changed externally\n");
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "Changed externally",
  );
  await sourceFill("# Unsaved editor changes\n");
  await fs.writeFile(file("src/example.py"), "# New disk version\n");
  await expect(
    page.locator(".editor-pane.active .conflict-banner"),
  ).toBeVisible();
  expect(await disk("src/example.py")).toBe("# New disk version\n");
  await page.getByRole("button", { name: "Review changes" }).click();
  await expect(
    page.getByRole("dialog", { name: "The file changed outside Margin" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save my edits as copy" }).click();
  await page.getByLabel("Workspace-relative path").fill("src/recovered.py");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  await expect
    .poll(() => disk("src/recovered.py"))
    .toBe("# Unsaved editor changes\n");
  expect(await disk("src/example.py")).toBe("# New disk version\n");
  expect(errors).toEqual([]);
});

test("PowerShell PTYs, multiple interactive terminals, layout and session restoration", async () => {
  await open("notes/welcome.md");
  await page
    .getByRole("button", { name: "Toggle terminal", exact: true })
    .click();
  await page.getByRole("button", { name: "New terminal", exact: true }).click();
  await expect(
    page.locator(".terminal-view.active .xterm-screen"),
  ).toBeVisible();
  const terminal = page.locator(".terminal-view.active .xterm-helper-textarea");
  await terminal.focus();
  await page.keyboard.type(
    process.platform === "win32"
      ? "Write-Output ('MARGIN_PTY_' + (6*7)); Set-Content terminal-created.txt 'real shell output'; (Get-Location).Path"
      : "printf 'MARGIN_PTY_%s\\n' $((6*7)); printf 'real shell output' > terminal-created.txt; pwd",
  );
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.locator(".terminal-view.active .xterm-rows").innerText())
    .toContain("MARGIN_PTY_42");
  await expect
    .poll(() => disk("terminal-created.txt"))
    .toContain("real shell output");
  // Read terminal buffers from the real main-process service through the supported bridge.
  await expect
    .poll(() => page.locator(".terminal-view.active .xterm-rows").innerText())
    .toContain("Workspace");
  await page.getByRole("button", { name: "New terminal", exact: true }).click();
  await expect(page.locator(".terminal-tabs>div")).toHaveCount(2);
  await page
    .locator(".terminal-tabs>div")
    .first()
    .locator("button")
    .first()
    .click();
  await expect(page.locator(".terminal-view.active .xterm-rows")).toContainText(
    "MARGIN_PTY_42",
  );
  await page.getByRole("separator", { name: "Resize explorer" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("separator", { name: "Resize terminal" }).focus();
  await page.keyboard.press("ArrowUp");
  await page
    .getByRole("button", { name: "Hide terminal", exact: true })
    .click();
  await expect(page.locator(".terminal-panel")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Toggle terminal", exact: true })
    .click();
  await expect(page.locator(".terminal-view.active .xterm-rows")).toContainText(
    "MARGIN_PTY_42",
  );
  const sidebarWidth = await page
    .locator(".sidebar")
    .evaluate((e) => e.getBoundingClientRect().width);
  const terminalHeight = await page
    .locator(".terminal-panel")
    .evaluate((e) => e.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/dark-terminal.png" });
  await page.evaluate(() =>
    window.margin.persist({ tabs: [], active: "", expanded: [] }),
  ); // renderer will persist its real session again on the following tab action.
  await open("notes/other.md");
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"))
          .sessions[root]?.active,
    )
    .toBe("notes/other.md");
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect(page.getByRole("tab", { name: /other.md/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page
      .locator(".sidebar")
      .evaluate((e) => e.getBoundingClientRect().width),
  ).toBe(sidebarWidth);
  expect(
    await page
      .locator(".terminal-panel")
      .evaluate((e) => e.getBoundingClientRect().height),
  ).toBe(terminalHeight);
  expect(errors).toEqual([]);
});

test("autosave, quick open, dirty drafts across forced restart and unsupported Markdown protection", async () => {
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Markdown source mode" }).click();
  await sourceFill("# A draft worth recovering\n");
  await expect
    .poll(
      async () =>
        JSON.parse(
          await fs.readFile(path.join(data, "state.json"), "utf8"),
        ).sessions[root]?.tabs.find((t) => t.path === "notes/welcome.md")?.text,
    )
    .toBe("# A draft worth recovering\n");
  expect(await disk("notes/welcome.md")).toContain("A quieter workspace");
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "A draft worth recovering",
  );
  await save();
  expect(await disk("notes/welcome.md")).toBe("# A draft worth recovering\n");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Autosave policy").selectOption("afterDelay");
  await page.getByRole("button", { name: "Close preferences" }).click();
  await sourceFill("# Autosaved\n");
  await expect.poll(() => disk("notes/welcome.md")).toBe("# Autosaved\n");
  await page.keyboard.press(shortcut + "+p");
  await page.getByLabel("Search files", { exact: true }).fill("example.php");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /example.php/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await fs.writeFile(
    file("unsafe.md"),
    '---\ntitle: Keep metadata\n---\n\n<script>throw new Error("never run")</script>\n\n[x][ref]\n\n[ref]: notes/welcome.md\n',
  );
  await expect(
    page.getByRole("treeitem", { name: "unsafe.md", exact: true }),
  ).toBeVisible();
  await open("unsafe.md");
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "<script>",
  );
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect(page.locator(".editor-pane.active .cm-content")).toBeVisible();
  expect(errors).toEqual([]);
});

test("heading levels, inline marks, nested lists, blockquotes, links and rich-text paste", async () => {
  await fs.writeFile(file("formatting.md"), "");
  await expect(
    page.getByRole("treeitem", { name: "formatting.md", exact: true }),
  ).toBeVisible();
  await open("formatting.md");
  const rich = page.locator(".editor-pane.active .document-content");
  for (let level = 1; level <= 6; level++) {
    await page
      .getByLabel("Text style", { exact: true })
      .selectOption(String(level));
    await page.keyboard.insertText("Heading level " + level);
    await page.keyboard.press("Enter");
  }
  await page.getByLabel("Text style", { exact: true }).selectOption("0");
  for (const [button, text, tag] of [
    ["Italic (Ctrl+I)", "italic words", "em"],
    ["Strikethrough", "retired words", "s"],
    ["Inline code", "inline_code", "code"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.keyboard.insertText(text);
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.keyboard.insertText(" ");
    await expect(rich.locator(tag)).toContainText(text);
  }
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bullet list", exact: true }).click();
  await page.keyboard.insertText("Parent item");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Nested item");
  await page
    .getByRole("button", { name: "Indent list item", exact: true })
    .click();
  await expect(rich.locator("ul ul")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Numbered list", exact: true })
    .click();
  await page.keyboard.insertText("Ordered item");
  await expect(rich.locator("ol")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Blockquote", exact: true }).click();
  await page.keyboard.insertText("A sentence to remember.");
  await expect(rich.locator("blockquote")).toContainText("A sentence");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Related note");
  await page.keyboard.press("Shift+Home");
  await page
    .getByRole("button", { name: "Edit link (Ctrl+K)", exact: true })
    .click();
  await page
    .getByLabel("Link destination", { exact: true })
    .fill("notes/other.md");
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  await expect(rich).toBeFocused();
  await expect(rich.locator('a[href="notes/other.md"]')).toHaveText(
    "Related note",
  );
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Horizontal rule", exact: true })
    .click();
  await expect(rich.locator("hr")).toHaveCount(1);
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    await clipboard.write([
      new ClipboardItem({
        "text/html": new Blob(
          ["<p>Rich <strong>browser paste</strong> survives.</p>"],
          { type: "text/html" },
        ),
        "text/plain": "Rich browser paste survives.",
      }),
    ]);
  });
  await rich.locator("p").last().click();
  await page.keyboard.press(shortcut + "+v");
  await expect(rich.locator("strong")).toContainText("browser paste");
  await save();
  const content = await disk("formatting.md");
  for (let level = 1; level <= 6; level++)
    expect(content).toContain("#".repeat(level) + " Heading level " + level);
  expect(content).toContain("*italic words*");
  expect(content).toContain("~~retired words~~");
  expect(content).toContain("`inline_code`");
  expect(content).toContain("[Related note](notes/other.md)");
  expect(content).toContain("> A sentence");
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  for (let level = 1; level <= 6; level++)
    await expect(rich.locator("h" + level)).toHaveText(
      "Heading level " + level,
    );
  await expect(rich.locator("ul ul")).toHaveCount(1);
  await rich
    .locator('a[href="notes/other.md"]')
    .click({ modifiers: [shortcut] });
  await expect(page.getByRole("tab", { name: /other.md/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(errors).toEqual([]);
});

test("image chooser, image drag/drop, attachment preferences and explorer drag/drop/duplicate/trash", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
    "base64",
  );
  await fs.writeFile(path.join(base, "reference.png"), png);
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Attachment location").selectOption("nearby");
  await page.getByLabel("Attachment folder").fill("images");
  await page.getByRole("button", { name: "Close preferences" }).click();
  // Substitute the native chooser result only; the real attachment and editor paths run.
  await app.evaluate(
    ({ dialog }, chosen) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [chosen],
      });
    },
    path.join(base, "reference.png"),
  );
  await page.getByRole("button", { name: "Insert image", exact: true }).click();
  await expect(page.locator(".editor-pane.active img[src]")).toHaveCount(1);
  await expect.poll(() => fs.readdir(file("notes/images"))).toHaveLength(1);
  await page
    .locator(".editor-pane.active .document-content")
    .evaluate((element, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], "dropped.png", { type: "image/png" }),
      );
      element.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientX: element.getBoundingClientRect().left + 50,
          clientY: element.getBoundingClientRect().top + 30,
        }),
      );
    }, png.toString("base64"));
  await expect(page.locator(".editor-pane.active img[src]")).toHaveCount(2);
  await save();
  expect(await disk("notes/welcome.md")).toContain("images/");
  expect((await fs.readdir(file("notes/images"))).length).toBe(2);
  await page
    .getByRole("treeitem", { name: "notes/other.md", exact: true })
    .dragTo(page.getByRole("treeitem", { name: "archive", exact: true }));
  await expect(
    page.getByRole("treeitem", { name: "archive/other.md", exact: true }),
  ).toBeVisible();
  expect(await disk("archive/other.md")).toContain("../notes/welcome.md");
  await page
    .getByRole("treeitem", { name: "archive/other.md", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await page
    .getByLabel("New path", { exact: true })
    .fill("archive/other-copy.md");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "archive/other-copy.md", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("treeitem", { name: "archive/other-copy.md", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /Move to Trash/ }).click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(
    page.getByRole("treeitem", { name: "archive/other-copy.md", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      fs.access(file("archive/other-copy.md")).then(
        () => true,
        () => false,
      ),
    )
    .toBe(false);
  expect(errors).toEqual([]);
});

test("native close prompts protect edits and stop the shell process tree", async () => {
  await open("src/example.py");
  await sourceFill("# Keep this draft\n");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await expect(
    page.getByRole("dialog", { name: "Save changes before closing?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "Keep this draft",
  );
  await page
    .getByRole("button", { name: "Toggle terminal", exact: true })
    .click();
  await page.getByRole("button", { name: "New terminal", exact: true }).click();
  await page.locator(".terminal-view.active .xterm-helper-textarea").focus();
  await page.keyboard.type(
    process.platform === "win32"
      ? "Write-Output ('SHELL_PID:' + $PID)"
      : "printf 'SHELL_PID:%s\\n' $$",
  );
  await page.keyboard.press("Enter");
  let pid;
  await expect
    .poll(async () => {
      const text = await page
        .locator(".terminal-view.active .xterm-rows")
        .innerText();
      const match = text.match(/SHELL_PID:(\d+)/);
      pid = match ? Number(match[1]) : 0;
      return pid;
    })
    .toBeGreaterThan(0);
  const closed = app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await page
    .getByRole("button", { name: "Keep drafts & close", exact: true })
    .click();
  await closed;
  await app.close().catch(() => {});
  app = null;
  await expect
    .poll(() => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
  expect(await disk("src/example.py")).toContain("def greet");
  await launch();
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "Keep this draft",
  );
  expect(errors).toEqual([]);
});

test("renderer isolation, path confinement, JSON diagnostics and literal HTML code fences", async () => {
  expect(
    await page.evaluate(() => ({
      require: typeof window.require,
      process: typeof window.process,
    })),
  ).toEqual({ require: "undefined", process: "undefined" });
  expect(
    await page.evaluate(() =>
      window.margin.read("../escape.txt").then(
        () => false,
        () => true,
      ),
    ),
  ).toBe(true);
  await open("src/example.json");
  await sourceFill('{"broken": }');
  await expect(
    page.locator(".editor-pane.active .cm-lint-marker-error"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close example.json", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard edits", exact: true })
    .click();
  expect(await disk("src/example.json")).toBe('{"hello": true}\n');
  await fs.writeFile(
    file("code-fences.md"),
    "---\ntitle: Metadata stays exact\n---\n\n# HTML example\n\n```html\n<script>window.__marginExecuted = true</script>\n```\n",
  );
  await expect(
    page.getByRole("treeitem", { name: "code-fences.md", exact: true }),
  ).toBeVisible();
  await open("code-fences.md");
  await expect(page.locator(".editor-pane.active pre")).toContainText(
    "<script>",
  );
  expect(await page.evaluate(() => window.__marginExecuted)).toBeUndefined();
  await page.locator(".editor-pane.active h1").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" edited");
  await save();
  expect(await disk("code-fences.md")).toMatch(
    /^---\ntitle: Metadata stays exact\n---\n/,
  );
  expect(await disk("code-fences.md")).toContain(
    "<script>window.__marginExecuted = true</script>",
  );
  expect(errors).toEqual([]);
});

test("code auto-format defaults on, respects indentation and is a single undoable edit", async () => {
  const input =
    "<!doctype html><html><head><style>body{margin:0;padding:10px}</style></head><body><h1>Hello</h1><p>Readable code.</p></body></html>";
  await fs.writeFile(file("format.html"), input);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(
    page.getByLabel("Automatically format code on open", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("Indentation", { exact: true }).selectOption("4");
  await page.getByRole("button", { name: "Close preferences" }).click();
  await expect(
    page.getByRole("treeitem", { name: "format.html", exact: true }),
  ).toBeVisible();
  await open("format.html");
  const content = page.locator(".editor-pane.active .cm-content");
  await expect(
    page.locator(".editor-pane.active .code-format-toolbar"),
  ).toContainText("Automatically formatted");
  const firstLine = await content.locator(".cm-line").first().boundingBox();
  const firstNumber = await page.locator(".editor-pane.active .cm-lineNumbers .cm-gutterElement").filter({ hasText: /^1$/ }).boundingBox();
  expect(Math.abs(firstLine.y - firstNumber.y)).toBeLessThan(1);
  expect(
    await content
      .locator(".cm-line")
      .filter({ hasText: "<head>" })
      .textContent(),
  ).toBe("    <head>");
  await expect(content).toContainText("margin: 0;");
  expect(await disk("format.html")).toBe(input);
  await content.click();
  await page.keyboard.press(shortcut + "+z");
  await expect(content).toHaveText(input);
  await expect(page.locator(".save-state")).toContainText("Saved");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+z" : "Control+y",
  );
  await expect(content).toContainText("margin: 0;");
  await save();
  expect(await disk("format.html")).toContain("\n    <head>");
  expect(await disk("format.html")).toContain("\n                margin: 0;");
  await page.getByRole("button", { name: "Close format.html" }).click();
  await open("format.html");
  await expect(content).toContainText("margin: 0;");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/code-formatting.png" });
});

test("formatting preference persists, manual command/shortcut work, and invalid code stays intact", async () => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Automatically format code on open", { exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Close preferences" }).click();
  const input = "function example(){const data={one:1,two:2};return data;}";
  await fs.writeFile(file("format.js"), input);
  await expect(
    page.getByRole("treeitem", { name: "format.js", exact: true }),
  ).toBeVisible();
  await open("format.js");
  let content = page.locator(".editor-pane.active .cm-content");
  await expect(content).toHaveText(input);
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"))
          .settings.formatOnOpen,
    )
    .toBe(false);
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"))
          .sessions[root]?.active,
    )
    .toBe("format.js");
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  content = page.locator(".editor-pane.active .cm-content");
  await expect(content).toHaveText(input);
  await content.click();
  await page.keyboard.press("Shift+Alt+f");
  await expect(content).toContainText("function example() {");
  expect(await disk("format.js")).toBe(input);
  await page.keyboard.press(shortcut + "+z");
  await expect(content).toHaveText(input);
  await page.keyboard.press(shortcut + "+Shift+p");
  await page
    .getByLabel("Search commands", { exact: true })
    .fill("Format document");
  await page.keyboard.press("Enter");
  await expect(content).toContainText("function example() {");
  await save();
  expect(await disk("format.js")).toContain("\n  const data");
  await fs.writeFile(file("invalid.js"), "function broken( {");
  await expect(
    page.getByRole("treeitem", { name: "invalid.js", exact: true }),
  ).toBeVisible();
  await open("invalid.js");
  await page
    .getByRole("button", { name: "Format document", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(content).toHaveText("function broken( {");
  expect(await disk("invalid.js")).toBe("function broken( {");
  expect(errors).toEqual([]);
});

test("format worker never overwrites edits made while formatting", async () => {
  const input = Array.from(
    { length: 5000 },
    (_, i) => `const entry${i}={one:1,two:2};`,
  ).join("\n");
  await fs.writeFile(file("large.js"), input);
  await expect(
    page.getByRole("treeitem", { name: "large.js", exact: true }),
  ).toBeVisible();
  await open("large.js");
  await sourceFill("const typedByUser = 42;");
  await expect(
    page.locator(".editor-pane.active .code-format-toolbar button"),
  ).not.toBeDisabled();
  await expect(page.locator(".editor-pane.active .cm-content")).toHaveText(
    "const typedByUser = 42;",
  );
  await save();
  expect(await disk("large.js")).toBe("const typedByUser = 42;");
  expect(errors).toEqual([]);
});

test("browser worker formats JSON, YAML, PHP and XML without desktop privileges", async () => {
  for (const [name, input, expected] of [
    ["pretty.json", '{"nested":{"one":1,"two":2}}', '"one": 1'],
    ["pretty.yaml", "hello: {one: 1,two: 2}", "one: 1, two: 2"],
    [
      "pretty.php",
      '<?php function greet($name){return "Hello ".$name;}',
      "function greet($name)",
    ],
    [
      "pretty.xml",
      "<root><nested><value>Hello</value></nested></root>",
      "<value>Hello</value>",
    ],
  ]) {
    await fs.writeFile(file(name), input);
    await expect(
      page.getByRole("treeitem", { name, exact: true }),
    ).toBeVisible();
    await open(name);
    await expect(
      page.locator(".editor-pane.active .code-format-toolbar"),
    ).toContainText("Automatically formatted");
    await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
      expected,
    );
    await save();
    expect(await disk(name)).not.toBe(input);
  }
  expect(errors).toEqual([]);
});
