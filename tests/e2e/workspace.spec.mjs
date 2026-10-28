import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let app, page, base, root, data, errors;
let hiddenWindows;
const shortcut = process.platform === "darwin" ? "Meta" : "Control";
const file = (name) => path.join(root, name);
async function disk(name) {
  return fs.readFile(file(name), "utf8");
}
async function diskWhenPresent(name) {
  try { return await disk(name); } catch(error) { if(error.code==='ENOENT')return undefined;throw error; }
}
async function open(name) {
  await page.getByRole("treeitem", { name, exact: true }).click();
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    name,
  );
}
async function documentAction(name) {
  await page.getByRole("button", {name: "Document actions", exact: true}).click();
  await page.getByRole("menuitem", {name, exact: true}).click();
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
async function launch(devURL, presentation = false) {
  const env = {
    ...process.env,
    MARGIN_DATA_PATH: data,
    MARGIN_WORKSPACE: root,
    MARGIN_TEST_HIDDEN: hiddenWindows ? "1" : "0",
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
  // Verify every launch, including restarts, really honors the quiet test mode.
  expect(await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((window) => window.isVisible()),
  )).toBe(!hiddenWindows);
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (presentation) await expect(page.locator(".application.presentation-mode")).toBeVisible();
  else await expect(
    page.getByRole("treeitem", { name: "notes/welcome.md", exact: true }),
  ).toBeVisible();
}
test.beforeEach(async ({}, testInfo) => {
  hiddenWindows = testInfo.project.use.headless !== false;
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
    const exported = await page.evaluate(() => window.margin.pdfExport({ path: "notes/welcome.md", mode: "combined", recursive: true, overlays: [] }));
    expect(exported.failed).toEqual([]);
    await expect(page.getByRole("treeitem", { name: "notes/welcome.pdf", exact: true })).toBeVisible();
    await open("notes/welcome.pdf");
    await expect(page.locator(".pdf-preview .page canvas").first()).toBeVisible();
    await expect(page.locator(".pdf-preview .textLayer").first()).toContainText("A quieter workspace");
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

test("PDF viewer opens exported documents inside tabs with navigation, text search and zoom", async () => {
  const result = await page.evaluate(() => window.margin.pdfExport({
    path: "notes", mode: "combined", recursive: true,
    overlays: [
      { path: "notes/other.md", text: "# Eerste pagina\n\nCafé en België.\n\n[Website](https://example.com)" },
      { path: "notes/welcome.md", text: "# Tweede pagina\n\nUnieke zoekterm: wandelpad." },
    ],
  }));
  expect(result.failed).toEqual([]);
  const before = await fs.readFile(file("notes.pdf"));
  await expect(page.getByRole("treeitem", { name: "notes.pdf", exact: true })).toBeVisible();
  await open("notes.pdf");
  const viewer = page.getByLabel("PDF viewer for notes.pdf", { exact: true });
  await expect(viewer.getByLabel("PDF page count", { exact: true })).toHaveText("/ 2");
  await expect(viewer.locator('.page[data-page-number="1"] canvas')).toBeVisible();
  await expect(viewer.locator(".textLayer")).toContainText(["Café en België."]);
  await expect(page.getByRole("button", { name: "Save file", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Markdown source mode", exact: true })).toHaveCount(0);
  await expect(viewer.getByRole("group", { name: "PDF zoom controls", exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Zoom out PDF", exact: true })).toHaveText("Zoom out");
  await expect(viewer.getByRole("button", { name: "Zoom in PDF", exact: true })).toHaveText("Zoom in");
  await viewer.getByLabel("PDF zoom", { exact: true }).click();
  await expect(viewer.getByLabel("PDF zoom", { exact: true })).toHaveText("100%");
  await viewer.getByRole("button", { name: "Zoom out PDF", exact: true }).click();
  await expect(viewer.getByLabel("PDF zoom", { exact: true })).toHaveText("80%");
  await viewer.getByRole("button", { name: "Zoom in PDF", exact: true }).click();
  await expect(viewer.getByLabel("PDF zoom", { exact: true })).toHaveText("100%");
  const initialZoom = await viewer.getByLabel("PDF zoom", { exact: true }).textContent();
  await viewer.getByRole("button", { name: "Zoom in PDF", exact: true }).click();
  await expect(viewer.getByLabel("PDF zoom", { exact: true })).not.toHaveText(initialZoom);
  await viewer.getByRole("button", { name: "Fit PDF to width", exact: true }).click();
  await viewer.getByRole("button", { name: "Next PDF page", exact: true }).click();
  await expect(viewer.getByLabel("PDF page", { exact: true })).toHaveValue("2");
  await expect(viewer.locator('.page[data-page-number="2"] canvas')).toBeVisible();
  await viewer.getByLabel("PDF page", { exact: true }).fill("1");
  await viewer.getByLabel("PDF page", { exact: true }).press("Enter");
  await expect(viewer.getByLabel("PDF page", { exact: true })).toHaveValue("1");
  await viewer.getByLabel("PDF pages", { exact: true }).focus();
  await page.keyboard.press(shortcut + "+f");
  await expect(viewer.getByRole("textbox", { name: "Find in PDF", exact: true })).toBeFocused();
  await viewer.getByRole("textbox", { name: "Find in PDF", exact: true }).fill("wandelpad");
  await expect(viewer.getByLabel("PDF search results", { exact: true })).toHaveText("1 / 1");
  await expect(viewer.locator(".textLayer .highlight.selected")).toContainText("wandelpad");
  await expect(viewer.getByLabel("PDF page", { exact: true })).toHaveValue("2");
  await open("notes/welcome.md");
  await page.locator('.editor-tab[data-tooltip="notes.pdf"]').click();
  await expect(viewer.getByLabel("PDF page", { exact: true })).toHaveValue("2");
  if (process.env.MARGIN_PDF_QA) {
    await fs.mkdir(process.env.MARGIN_PDF_QA, { recursive: true });
    await page.screenshot({ path: path.join(process.env.MARGIN_PDF_QA, "pdf-viewer.png") });
  }
  await expect.poll(async () => {
    const state = JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"));
    return state.sessions[root]?.tabs.find((tab) => tab.path === "notes.pdf")?.position?.pdf?.page;
  }).toBe(2);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect(page.getByLabel("PDF page", { exact: true })).toHaveValue("2");
  expect(await fs.readFile(file("notes.pdf"))).toEqual(before);
  expect(errors).toEqual([]);
});

test("PDF viewer reports invalid files and reloads replaced PDFs without opening an external browser", async () => {
  await fs.writeFile(file("broken.pdf"), "This is not a PDF");
  await expect(page.getByRole("treeitem", { name: "broken.pdf", exact: true })).toBeVisible();
  await open("broken.pdf");
  await expect(page.getByRole("alert")).toContainText("not a valid PDF");
  const exported = await page.evaluate(() => window.margin.pdfExport({ path: "notes", mode: "combined", recursive: true, overlays: [] }));
  expect(exported.failed).toEqual([]);
  await fs.copyFile(file("notes.pdf"), file("broken.pdf"));
  await expect(page.getByLabel("PDF page count", { exact: true })).toHaveText("/ 2");
  await expect(page.locator('.pdf-preview .page[data-page-number="1"] canvas')).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".editor-pane.active .cm-content")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("PDF export uses unsaved Markdown, prints real PDFs and preserves existing exports", async () => {
  await fs.writeFile(file("assets/export.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120"><rect width="600" height="120" rx="10" fill="#245e55"/><text x="24" y="72" fill="white" font-size="32">Margin PDF export</text></svg>');
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Markdown source mode", exact: true }).click();
  const text = '# PDF export · België\n\nDeze **niet-opgeslagen** versie hoort in de PDF.\n\n![Export](../assets/export.svg)\n\n## Tabel\n\n| Naam | Waarde |\n| --- | --- |\n| Café | € 42 |\n\n- [x] Export getest\n- [ ] Nog te doen\n\n```js\nconst answer = 42;\n```\n\n> Een rustige leesbare PDF.\n';
  await sourceFill(text);
  await page.locator(".editor-tab.active").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export to PDF…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export to PDF", exact: true });
  await expect(dialog.getByLabel("PDF export preview")).toContainText("1 Markdown file → 1 PDF");
  await dialog.getByRole("button", { name: "Export PDF", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Export complete. 1 PDF saved.");
  const bytes = await fs.readFile(file("notes/welcome.pdf"));
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(5000);
  expect(await disk("notes/welcome.md")).toContain("A quieter workspace");
  // Retain an optional QA sample without making external PDF tooling a test dependency.
  if (process.env.MARGIN_PDF_QA) {
    await fs.mkdir(process.env.MARGIN_PDF_QA, { recursive: true });
    await fs.writeFile(path.join(process.env.MARGIN_PDF_QA, "markdown-export.pdf"), bytes);
    await page.screenshot({ path: path.join(process.env.MARGIN_PDF_QA, "export-dialog.png") });
  }
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("treeitem", { name: "notes/welcome.md", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export to PDF…", exact: true }).click();
  await expect(dialog.getByLabel("PDF export preview")).toContainText("welcome (2).pdf");
  await dialog.getByRole("button", { name: "Export PDF", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Export complete.");
  expect(await fs.readFile(file("notes/welcome.pdf"))).toEqual(bytes);
  expect((await fs.readFile(file("notes/welcome (2).pdf"))).subarray(0, 5).toString()).toBe("%PDF-");
  expect(errors).toEqual([]);
});

test("folder PDF export supports combined, subfolders, individual files and custom destinations", async () => {
  await fs.mkdir(file("notes/chapter/deep"), { recursive: true });
  await fs.writeFile(file("notes/chapter/a.md"), "# Chapter\n\nA chapter note.");
  await fs.writeFile(file("notes/chapter/deep/b.md"), "# Nested\n\nA nested note.");
  const combined = await page.evaluate(() => window.margin.pdfExport({ path: "notes", mode: "combined", recursive: true, overlays: [] }));
  expect(combined.failed).toEqual([]);
  expect(combined.paths).toEqual([file("notes.pdf")]);
  await page.getByRole("treeitem", { name: "notes", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export to PDF…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export to PDF", exact: true });
  await expect(dialog.getByLabel("PDF export preview")).toContainText("4 Markdown files → 1 PDF");
  await dialog.getByLabel("Include nested folders").uncheck();
  await expect(dialog.getByLabel("PDF export preview")).toContainText("2 Markdown files → 1 PDF");
  await dialog.getByLabel("Include nested folders").check();
  await dialog.getByLabel("PDF layout").selectOption("subfolders");
  await expect(dialog.getByLabel("PDF export preview")).toContainText("4 Markdown files → 2 PDFs");
  await dialog.getByRole("button", { name: "Export PDF", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Export complete. 2 PDFs saved.");
  for (const name of ["notes.pdf", "notes (2).pdf", "notes/chapter.pdf"])
    expect((await fs.readFile(file(name))).subarray(0, 5).toString()).toBe("%PDF-");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("treeitem", { name: "notes", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export to PDF…", exact: true }).click();
  await dialog.getByLabel("PDF layout").selectOption("files");
  const destination = path.join(base, "pdf-exports");
  await fs.mkdir(destination);
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, destination);
  await dialog.getByRole("button", { name: "Choose folder…", exact: true }).click();
  await expect(dialog.getByLabel("PDF export preview")).toContainText("4 Markdown files → 4 PDFs");
  await expect(dialog.getByLabel("PDF export preview")).toContainText(destination);
  await dialog.getByRole("button", { name: "Export PDF", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Export complete. 4 PDFs saved.");
  for (const name of ["welcome.pdf", "other.pdf", "chapter/a.pdf", "chapter/deep/b.pdf"])
    expect((await fs.readFile(path.join(destination, name))).subarray(0, 5).toString()).toBe("%PDF-");
  expect(errors).toEqual([]);
});

test("Teaching presentation follows the workspace theme by default and migrates the old light default", async () => {
  await open("src/example.html");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(page.getByLabel("Presentation theme", { exact: true })).toHaveValue("inherit");
  await page.getByLabel(/^Color theme/).selectOption("dark");
  await page.getByRole("button", { name: "Close preferences" }).click();
  const editor = page.locator(".editor-pane.active .cm-editor");
  const editorBackground = await editor.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.keyboard.press("F8");
  await expect(page.locator(".application")).toHaveClass(/presentation-mode/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(editor).toHaveCSS("background-color", editorBackground);
  // Theme changes continue to apply while presentation mode is active.
  await page.keyboard.press(shortcut + "+,");
  await page.getByLabel(/^Color theme/).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel(/^Color theme/).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Close preferences" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(async () => JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8")).sessions[root]?.active).toBe("src/example.html");
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  const statePath = path.join(data, "state.json");
  const previous = JSON.parse(await fs.readFile(statePath, "utf8"));
  previous.settings.presentationTheme = "light";
  delete previous.presentationThemeVersion;
  await fs.writeFile(statePath, JSON.stringify(previous));
  await launch();
  await page.keyboard.press("F8");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // An explicitly chosen light override remains light after a later restart.
  await page.keyboard.press(shortcut + "+,");
  await expect(page.getByLabel("Presentation theme", { exact: true })).toHaveValue("inherit");
  await page.getByLabel("Presentation theme", { exact: true }).selectOption("light");
  await page.getByRole("button", { name: "Close preferences" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(async () => JSON.parse(await fs.readFile(statePath, "utf8")).settings.presentationMode).toBe(true);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch(undefined, true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});

test("Teaching presentation uses a persistent lesson profile and restores the normal workspace", async () => {
  await open("src/example.html");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Presentation font size", { exact: true }).selectOption("28");
  await page.getByLabel("Presentation theme", { exact: true }).selectOption("dark");
  await page.getByRole("button", { name: "Close preferences" }).click();
  const ordinary = JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8")).settings;
  await page.keyboard.press("F8");
  await expect(page.locator(".application")).toHaveClass(/presentation-mode/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".editor-pane.active .code-editor")).toHaveCSS("font-size", "28px");
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.locator(".status-bar")).toBeHidden();
  await expect.poll(async () => { const saved = JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8")); return saved.settings.presentationMode && saved.sessions[root]?.active === "src/example.html"; }).toBe(true);
  await page.screenshot({ path: "test-results/teaching-presentation.png" });
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch(undefined, true);
  await expect(page.locator(".application")).toHaveClass(/presentation-mode/);
  await expect(page.locator(".editor-pane.active .code-editor")).toHaveCSS("font-size", "28px");
  await page.keyboard.press("Escape");
  await expect(page.locator(".application")).not.toHaveClass(/presentation-mode/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", ordinary.theme);
  await expect(page.locator(".editor-pane.active .code-editor")).toHaveCSS("font-size", ordinary.fontSize + "px");
  await expect(page.locator(".status-bar")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Teaching pinned assignment survives focused navigation, closing code tabs, moves and restart", async () => {
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Pin assignment", exact: true }).click();
  const assignment = () => page.locator('.editor-pane[data-path="notes/welcome.md"]');
  await expect(assignment().locator(".split-pane-title")).toContainText("Pinned assignment");
  await expect(page.locator(".assignment-placeholder")).toBeVisible();
  await open("src/example.php");
  await assignment().locator("h1").click();
  await open("src/example.html");
  await expect(assignment()).toBeVisible();
  await expect(page.locator('.editor-pane[data-path="src/example.html"]')).toHaveCSS("grid-column-start", "2");
  await page.keyboard.press(shortcut + "+w");
  await expect(assignment()).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpin assignment", exact: true })).toBeVisible();
  await open("src/example.php");
  await expect.poll(async () => JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8")).sessions[root]?.split?.assignment).toBe(true);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect(assignment()).toBeVisible();
  await expect(page.locator('.editor-pane[data-path="src/example.php"]')).toBeVisible();
  await move("notes/welcome.md", "notes/assignment.md");
  await expect(page.locator('.editor-pane[data-path="notes/assignment.md"] .split-pane-title')).toContainText("Pinned assignment");
  await open("src/example.html");
  await expect(page.locator('.editor-pane[data-path="notes/assignment.md"]')).toBeVisible();
  await page.getByRole("button", { name: "Unpin assignment", exact: true }).click();
  await expect(page.locator(".editor-area")).not.toHaveClass(/split/);
  expect(errors).toEqual([]);
});

test("Teaching live HTML preview follows unsaved HTML and CSS beside a PDF assignment and restores after restart", async () => {
  const exported = await page.evaluate(() => window.margin.pdfExport({ path: "notes/welcome.md", mode: "combined", recursive: true, overlays: [] }));
  expect(exported.failed).toEqual([]);
  await expect(page.getByRole("treeitem", { name: "notes/welcome.pdf", exact: true })).toBeVisible();
  await open("notes/welcome.pdf");
  await page.getByRole("button", { name: "Pin assignment", exact: true }).click();
  await open("src/example.html");
  await page.getByRole("button", { name: "Show live preview beside code", exact: true }).click();
  const original = await disk("src/example.html");
  const html = '<link rel="stylesheet" href="example.css"><h1>Live lesson</h1><script>parent.document.body.dataset.unsafe = "executed"</script>';
  await sourceFill(html);
  const preview = page.frameLocator('.live-preview iframe');
  await expect(preview.locator("h1")).toHaveText("Live lesson");
  await expect(preview.locator("h1")).toHaveCSS("color", "rgb(0, 128, 0)");
  await expect(page.locator('.editor-pane[data-path="notes/welcome.pdf"] canvas').first()).toBeVisible();
  await expect(page.locator('.editor-pane.active .cm-content')).toBeVisible();
  expect(await disk("src/example.html")).toBe(original);
  await open("src/example.css");
  await sourceFill("h1 { color: rgb(120, 20, 30); }");
  await expect(preview.locator("h1")).toHaveCSS("color", "rgb(120, 20, 30)");
  await fs.writeFile(file("src/example.css"), "h1 { color: rgb(0, 0, 200); }");
  // A dirty stylesheet wins over the externally modified disk copy.
  await expect(preview.locator("h1")).toHaveCSS("color", "rgb(120, 20, 30)");
  expect(await page.locator("body").getAttribute("data-unsafe")).toBeNull();
  await open("src/example.html");
  await preview.locator("h1").click();
  await page.keyboard.press("F8");
  await expect(page.locator(".application")).toHaveClass(/presentation-mode/);
  await page.screenshot({ path: "test-results/teaching-live-preview.png" });
  await page.getByRole("button", { name: "Leave presentation mode", exact: true }).click();
  await expect(page.locator(".application")).not.toHaveClass(/presentation-mode/);
  await open("src/example.css");
  await expect.poll(async () => {
    const saved = JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8")).sessions[root];
    return saved?.livePreview && saved.previewTarget === "src/example.html" && saved.active === "src/example.css";
  }).toBe(true);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect(page.frameLocator('.live-preview iframe').locator("h1")).toHaveText("Live lesson");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute("data-tooltip", "src/example.css");
  await expect(page.locator('.editor-pane[data-path="notes/welcome.pdf"] canvas').first()).toBeVisible();
  await page.getByRole("button", { name: "Close live preview", exact: true }).click();
  await expect(page.locator(".live-preview")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Teaching live preview divider resizes code and result with mouse and keyboard and restores its ratio", async () => {
  await open("src/example.html");
  await page.getByRole("button", { name: "Show live preview beside code", exact: true }).click();
  let divider = page.getByRole("separator", { name: "Resize code and live preview", exact: true });
  let code = page.locator('.editor-pane[data-path="src/example.html"]');
  let preview = page.locator(".live-preview");
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  const before = await code.boundingBox();
  const handle = await divider.boundingBox();
  const frame = page.frameLocator(".live-preview iframe");
  await frame.locator("body").evaluate((body) => { body.dataset.resizePreserved = "yes"; });
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 170, handle.y + handle.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await code.boundingBox()).width).toBeGreaterThan(before.width + 120);
  await expect.poll(async () => Number(await divider.getAttribute("aria-valuenow"))).toBeGreaterThan(60);
  await expect(divider).toHaveAttribute("data-dragging", "false");
  await expect(frame.locator("body")).toHaveAttribute("data-resize-preserved", "yes");
  await divider.dblclick();
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  await divider.focus();
  await page.keyboard.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "20");
  await page.keyboard.press("End");
  await expect(divider).toHaveAttribute("aria-valuenow", "80");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", "68");
  await expect.poll(async () => JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8")).sessions[root]?.previewRatio).toBe(68);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  divider = page.getByRole("separator", { name: "Resize code and live preview", exact: true });
  code = page.locator('.editor-pane[data-path="src/example.html"]');
  preview = page.locator(".live-preview");
  await expect(divider).toHaveAttribute("aria-valuenow", "68");
  await expect.poll(async () => (await code.boundingBox()).width / (await preview.boundingBox()).width).toBeGreaterThan(2);
  // With an assignment pinned, the same handle resizes only code/result.
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Pin assignment", exact: true }).click();
  await open("src/example.html");
  const assignment = page.locator('.editor-pane[data-path="notes/welcome.md"]');
  const assignmentBefore = await assignment.boundingBox();
  const tripleHandle = await divider.boundingBox();
  await page.mouse.move(tripleHandle.x + tripleHandle.width / 2, tripleHandle.y + 100);
  await page.mouse.down();
  await page.mouse.move(tripleHandle.x - 90, tripleHandle.y + 100, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => Number(await divider.getAttribute("aria-valuenow"))).toBeLessThan(60);
  expect(Math.abs((await assignment.boundingBox()).width - assignmentBefore.width)).toBeLessThan(2);
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  await expect(page.locator(".outline")).toBeVisible();
  const resultBox = await preview.boundingBox();
  const outlineBox = await page.locator(".outline").boundingBox();
  expect(outlineBox.x).toBeGreaterThanOrEqual(resultBox.x + resultBox.width - 1);
  await page.getByRole("button", { name: "Close live preview", exact: true }).click();
  await expect(divider).toHaveCount(0);
  await expect(assignment).toBeVisible();
  await expect(code).toBeVisible();
  expect(errors).toEqual([]);
});

test("Teaching live PHP preview explicitly starts, renders unsaved includes, reports errors and stops", async () => {
  const { spawnSync } = await import("node:child_process");
  test.skip(!["php", ...(process.platform === "darwin" ? ["/opt/homebrew/bin/php", "/usr/local/bin/php"] : [])].some((exe) => spawnSync(exe, ["-v"], { windowsHide: true }).status === 0), "PHP is not installed");
  await open("src/example.php");
  const original = await disk("src/example.php");
  await sourceFill('<?php require "value.php"; echo "<h1>" . $value . "</h1>";');
  await fs.writeFile(file("src/value.php"), '<?php $value = "Saved include";');
  await expect(page.getByRole("treeitem", { name: "src/value.php", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show live preview beside code", exact: true }).click();
  await expect(page.locator(".live-preview iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Start PHP preview", exact: true }).click();
  const preview = page.frameLocator('.live-preview iframe');
  await expect(preview.locator("h1")).toHaveText("Saved include");
  await open("src/value.php");
  // Both PHP files are previewable; return to the entry point after editing the include.
  await sourceFill('<?php $value = "Unsaved include";');
  await open("src/example.php");
  await expect(preview.locator("h1")).toHaveText("Unsaved include");
  expect(await disk("src/example.php")).toBe(original);
  expect(await disk("src/value.php")).toContain("Saved include");
  await sourceFill("<?php if (");
  await expect(preview.locator("body")).toContainText("Parse error");
  await sourceFill('<?php echo "<h1>Recovered</h1>";');
  await expect(preview.locator("h1")).toHaveText("Recovered");
  await page.getByRole("button", { name: "Stop PHP preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start PHP preview", exact: true })).toBeVisible();
  await sourceFill('<?php echo "<h1>Stopped</h1>";');
  await expect(preview.locator("h1")).toHaveText("Recovered");
  await page.getByRole("button", { name: "Close live preview", exact: true }).click();
  expect(errors).toEqual([]);
});

test("HTML visual mode previews unsaved content and relative assets without changing source", async () => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Automatically format code on open", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Close preferences" }).click();
  await open("src/example.html");
  await expect(page.getByRole("button", { name: "HTML source mode" })).toHaveClass("active");
  const original = await disk("src/example.html");
  const html = `<!DOCTYPE html><html><head><base href="https://example.invalid/"><meta http-equiv="refresh" content="0;url=https://example.invalid/"><link rel="stylesheet" href="example.css"></head>
    <body><h1 style="background: rgb(1, 2, 3)">Unsaved preview</h1>
    <img src="../assets/preview.svg"><a href="#target">Jump</a>
    <div style="height: 1400px"></div><h2 id="target">Target</h2>
    <a href="../notes/other.md">Other note</a>
    <script>parent.document.body.dataset.previewScript = "executed"</script>
    </body></html>`;
  await fs.writeFile(file("assets/preview.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="red"/></svg>');
  await sourceFill(html);
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  const preview = page.frameLocator('iframe[title="HTML preview for src/example.html"]');
  await expect(preview.locator("h1")).toHaveText("Unsaved preview");
  await expect(preview.locator("h1")).toHaveCSS("color", "rgb(0, 128, 0)");
  await expect(preview.locator("h1")).toHaveCSS("background-color", "rgb(1, 2, 3)");
  await expect.poll(() => preview.locator("img").evaluate((img) => img.naturalWidth)).toBe(24);
  await page.screenshot({ path: "test-results/html-preview.png" });
  expect(await disk("src/example.html")).toBe(original);
  expect(await page.locator("body").getAttribute("data-preview-script")).toBeNull();
  await preview.getByRole("link", { name: "Jump", exact: true }).click();
  await expect(preview.locator("#target")).toBeInViewport();
  await page.getByRole("button", { name: "HTML source mode" }).click();
  expect(await page.locator(".editor-pane.active .cm-content").innerText()).toBe(html);
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await preview.locator("h1").click();
  await page.keyboard.press(shortcut + "+f");
  await expect(page.getByRole("button", { name: "HTML source mode" })).toHaveClass("active");
  await expect(page.locator(".editor-pane.active .cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await preview.locator("h1").click();
  await page.keyboard.press(shortcut + "+s");
  await expect.poll(() => disk("src/example.html")).toBe(html);
  await preview.getByRole("link", { name: "Other note", exact: true }).click();
  await expect(page.locator(".editor-tab.active")).toHaveAttribute("data-tooltip", "notes/other.md");
  await expect(page.locator(".editor-pane.active .document-content")).toBeVisible();
  expect(errors).toEqual([]);
});

test("HTML visual mode survives external reloads and a restart while HTM defaults to source", async () => {
  await open("src/example.html");
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  const preview = page.frameLocator('iframe[title="HTML preview for src/example.html"]');
  await expect(preview.locator("h1")).toHaveText("Hello");
  await fs.writeFile(file("src/example.html"), '<html><body><h1>External update</h1><div style="height: 1600px"></div><h2>End</h2></body></html>\n');
  await expect(preview.locator("h1")).toHaveText("External update");
  await expect(page.getByRole("button", { name: "Visual mode", exact: true })).toHaveClass("active");
  await preview.getByRole("heading", { name: "End", exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(async () => {
    const state = JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"));
    const tab = state.sessions[root]?.tabs.find((tab) => tab.path === "src/example.html");
    return tab?.mode === "visual" && tab.position?.scrollTop > 0;
  }).toBe(true);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect(page.frameLocator('iframe[title="HTML preview for src/example.html"]').locator("h1")).toHaveText("External update");
  await expect(page.frameLocator('iframe[title="HTML preview for src/example.html"]').getByRole("heading", { name: "End", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  await page.getByRole("complementary", { name: "Document outline" }).getByRole("button", { name: /h2 — End, line/ }).click();
  await expect(page.getByRole("button", { name: "HTML source mode" })).toHaveClass("active");
  await expect(page.locator(".editor-pane.active .cm-content")).toBeFocused();
  await fs.writeFile(file("src/legacy.HTM"), "<h1>Legacy HTML</h1>\n");
  await open("src/legacy.HTM");
  await expect(page.getByRole("button", { name: "HTML source mode" })).toHaveClass("active");
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect(page.frameLocator('iframe[title="HTML preview for src/legacy.HTM"]').locator("h1")).toHaveText("Legacy HTML");
  expect(errors).toEqual([]);
});

test("SVG visual mode renders unsaved XML, preserves source and supports source search", async () => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Automatically format code on open", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Close preferences" }).click();
  const original = '<?xml version="1.0" encoding="UTF-8"?>\r\n<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160">\r\n  <defs><linearGradient id="gradient"><stop stop-color="gold"/><stop offset="1" stop-color="orange"/></linearGradient></defs>\r\n  <rect width="200" height="160" fill="url(#gradient)"/>\r\n  <text x="12" y="80">Original drawing</text>\r\n  <script>parent.document.body.dataset.svgScript = "executed"</script>\r\n</svg>\r\n';
  await fs.writeFile(file("src/drawing.SVG"), original);
  await open("src/drawing.SVG");
  await expect(page.getByRole("button", { name: "SVG source mode" })).toHaveClass("active");
  const updated = original.replace("Original drawing", "Unsaved drawing");
  await sourceFill(updated);
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  const preview = page.frameLocator('iframe[title="SVG preview for src/drawing.SVG"]');
  await expect(preview.locator("svg")).toBeVisible();
  await expect(preview.locator("text")).toHaveText("Unsaved drawing");
  await expect(preview.locator("linearGradient")).toHaveCount(1);
  expect(await preview.locator("svg").evaluate((svg) => svg.namespaceURI)).toBe("http://www.w3.org/2000/svg");
  expect(await page.locator("body").getAttribute("data-svg-script")).toBeNull();
  expect(await disk("src/drawing.SVG")).toBe(original);
  await page.screenshot({ path: "test-results/svg-preview.png" });
  await page.getByRole("button", { name: "SVG source mode" }).click();
  expect((await page.locator(".editor-pane.active .cm-line").allTextContents()).join("\n")).toBe(updated.replace(/\r\n/g, "\n"));
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await preview.locator("svg").click();
  await page.keyboard.press(shortcut + "+f");
  await expect(page.getByRole("button", { name: "SVG source mode" })).toHaveClass("active");
  await expect(page.locator(".editor-pane.active .cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await preview.locator("svg").click();
  await page.keyboard.press(shortcut + "+s");
  await expect.poll(() => disk("src/drawing.SVG")).toBe(updated);
  expect(errors).toEqual([]);
});

test("SVG visual mode survives external updates and restart and retains malformed source", async () => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Automatically format code on open", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Close preferences" }).click();
  const original = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="50" fill="red"/></svg>\n';
  await fs.writeFile(file("src/drawing.svg"), original);
  await open("src/drawing.svg");
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  const preview = () => page.frameLocator('iframe[title="SVG preview for src/drawing.svg"]');
  await expect(preview().locator("circle")).toHaveCSS("fill", "rgb(255, 0, 0)");
  const updated = original.replace('fill="red"', 'fill="blue"');
  await fs.writeFile(file("src/drawing.svg"), updated);
  await expect(preview().locator("circle")).toHaveCSS("fill", "rgb(0, 0, 255)");
  await expect.poll(async () => {
    const state = JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"));
    return state.sessions[root]?.tabs.find((tab) => tab.path === "src/drawing.svg")?.mode;
  }).toBe("visual");
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect(preview().locator("circle")).toHaveCSS("fill", "rgb(0, 0, 255)");
  await page.getByRole("button", { name: "SVG source mode" }).click();
  const invalid = '<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>';
  await sourceFill(invalid);
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect(preview().getByRole("alert")).toContainText("Correct the SVG markup in Source");
  await page.getByRole("button", { name: "SVG source mode" }).click();
  expect(await page.locator(".editor-pane.active .cm-content").innerText()).toBe(invalid);
  await sourceFill(updated);
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect(preview().locator("circle")).toHaveCSS("fill", "rgb(0, 0, 255)");
  expect(await disk("src/drawing.svg")).toBe(updated);
  expect(errors).toEqual([]);
});

test("visual authoring, tables, formatting, undo, source mode and repeated serialization", { tag: "@smoke" }, async () => {
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

test("all requested code languages highlight, edit/save, search/replace, diagnostics and external changes", { tag: "@smoke" }, async () => {
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
    .poll(() => diskWhenPresent("src/recovered.py"))
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
    .poll(() => diskWhenPresent("terminal-created.txt"))
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

test("autosave, quick open, dirty drafts across forced restart and unsupported Markdown protection", { tag: "@smoke" }, async () => {
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
  await expect.poll(() => diskWhenPresent("notes/welcome.md")).toBe("# Autosaved\n");
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
  await expect(page.getByLabel("Markdown preview", { exact: true })).toBeVisible();
  await expect(page.locator(".editor-pane.active script")).toHaveCount(0);
  expect(await disk("unsafe.md")).toBe('---\ntitle: Keep metadata\n---\n\n<script>throw new Error("never run")</script>\n\n[x][ref]\n\n[ref]: notes/welcome.md\n');
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
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+ArrowLeft" : "Shift+Home");
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
  // macOS keeps the application running after its last window closes.
  const closed =
    process.platform === "darwin"
      ? page.waitForEvent("close")
      : app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await page
    .getByRole("button", { name: "Keep drafts & close", exact: true })
    .click();
  await closed;
  if (process.platform === "darwin")
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(0);
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
  if (process.platform === "darwin")
    await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  app = null;
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

test("Markdown visual preview renders PHP examples and reference links while preserving source", async () => {
  await settingsManual();
  const php =
    "<?php\n$titel = 'ProjectHub';\necho $titel;\n?>\n\n<h1><?= $titel ?></h1>";
  const fenced =
    "# PHP example\n\n```php\n" +
    php +
    "\n```\n\n[PDF](<Extra oefening.pdf>)\n";
  const initial = fenced.replace(/\n/g, "\r\n");
  await fs.writeFile(file("php-example.md"), initial);
  await expect(
    page.getByRole("treeitem", { name: "php-example.md", exact: true }),
  ).toBeVisible();
  await open("php-example.md");
  await expect(
    page.getByRole("textbox", { name: "Visual Markdown editor" }),
  ).toBeVisible();
  await expect(page.locator(".editor-pane.active pre code")).toHaveText(php);
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  const original =
    "\uFEFF---\r\ntitle: Metadata stays exact\r\n---\r\n\r\n" +
    (
      fenced +
      "\n[Lesson][L1]\n\n[Jump](#last-section)\n\n" +
      "Paragraph for scrolling.\n\n".repeat(40) +
      "## Last section\n\n<strong>Safe HTML</strong><script>window.__marginExecuted = true</script>\n\n" +
      "[L1]: notes/other.md\n"
    ).replace(/\n/g, "\r\n");
  await sourceFill(original);
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  let preview = page.getByLabel("Markdown preview", { exact: true });
  await expect(preview).toBeVisible();
  await expect(
    page.getByText(
      "Read-only preview · Edit in Source to preserve the original Markdown",
    ),
  ).toBeVisible();
  await expect(preview.locator("[contenteditable]")).toHaveCount(0);
  await expect(preview.locator("pre code")).toHaveText(php + "\n");
  await expect(
    preview.getByRole("link", { name: "Lesson", exact: true }),
  ).toHaveAttribute("href", "notes/other.md");
  await expect(preview.locator("strong")).toHaveText("Safe HTML");
  await expect(preview.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => window.__marginExecuted)).toBeUndefined();
  expect(await disk("php-example.md")).toBe(initial);
  await save();
  expect(await disk("php-example.md")).toBe(original);
  await preview.getByRole("link", { name: "Jump", exact: true }).click();
  await expect(
    preview.getByRole("heading", { name: "Last section", exact: true }),
  ).toBeInViewport();
  await preview.getByRole("link", { name: "Lesson", exact: true }).click();
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "notes/other.md",
  );
  await open("php-example.md");
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Document outline" })
    .locator(".outline-entry")
    .filter({ hasText: "Last section" })
    .click();
  await expect(
    preview.getByRole("heading", { name: "Last section", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Close outline", exact: true })
    .click();
  await page.keyboard.press(shortcut + "+f");
  await expect(
    page.locator(".editor-pane.active .cm-search input[name=search]"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await page
    .getByRole("button", { name: "Close php-example.md", exact: true })
    .click();
  await open("php-example.md");
  await expect(page.locator(".source-protection")).toContainText(
    "embedded HTML",
  );
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse(
          await fs.readFile(path.join(data, "state.json"), "utf8"),
        ).sessions[root]?.tabs.find((tab) => tab.path === "php-example.md")
          ?.mode,
    )
    .toBe("visual");
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  app = null;
  await launch();
  preview = page.getByLabel("Markdown preview", { exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.locator("pre code")).toHaveText(php + "\n");
  expect(await disk("php-example.md")).toBe(original);
  expect(errors).toEqual([]);
});

test("compact editor keeps actions in tabs and tooltips appear promptly", async () => {
  await open("src/example.html");
  await expect(
    page.locator(".breadcrumbs, .document-header, .source-label"),
  ).toHaveCount(0);
  await expect(page.locator(".tabs-bar .save-state")).toContainText("Saved");
  await expect(
    page
      .locator(".tabs-bar")
      .getByRole("button", { name: "Save file", exact: true }),
  ).toBeVisible();
  const tabs = await page.locator(".tabs-bar").boundingBox();
  const editor = await page.locator(".editor-pane.active").boundingBox();
  expect(Math.abs(editor.y - (tabs.y + tabs.height))).toBeLessThan(1);

  const newFolder = page.getByRole("button", {
    name: "New folder",
    exact: true,
  });
  await newFolder.locator("svg").hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveText("New folder", { timeout: 800 });
  await expect(newFolder).toHaveAttribute(
    "aria-describedby",
    await tooltip.getAttribute("id"),
  );
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await expect(newFolder).not.toHaveAttribute("aria-describedby");

  await page.mouse.move(0, 0);
  await page.locator(".editor-tab.active > span").first().hover();
  await expect(tooltip).toHaveText("src/example.html", { timeout: 800 });
  const bounds = await tooltip.boundingBox();
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 8);

  await page.mouse.move(0, 0);
  await newFolder.focus();
  await expect(tooltip).toHaveText("New folder", { timeout: 800 });
  await page.keyboard.press("Tab");
  await expect(tooltip).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/compact-editor.png" });
  await open("notes/welcome.md");
  await page
    .locator(".tabs-bar")
    .getByRole("button", { name: "Markdown source mode" })
    .click();
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "# A quieter workspace",
  );
  await page
    .locator(".tabs-bar")
    .getByRole("button", { name: "Visual mode", exact: true })
    .click();
  await expect(page.locator(".editor-pane.active h1")).toHaveText(
    "A quieter workspace",
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
  const firstNumber = await page
    .locator(".editor-pane.active .cm-lineNumbers .cm-gutterElement")
    .filter({ hasText: /^1$/ })
    .boundingBox();
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
  await expect(
    page.getByRole("dialog", { name: "Command palette", exact: true }),
  ).toHaveCount(0);
  await content.click();
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

test("document outline navigates HTML and mixed PHP, updates unsaved edits and switches files", async () => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Automatically format code on open", { exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Close preferences" }).click();
  const html =
    '<main id="app">\n  <h1>Hello <em>world</em></h1>\n  <section class="hero">Content</section>\n</main>\n';
  const php =
    '<main>\n<?php\n// function fake() {}\nclass Controller {\n  public function render() {}\n}\n?>\n<section id="content"><h2>Welcome</h2></section>\n</main>\n';
  await fs.writeFile(file("outline.html"), html);
  await fs.writeFile(file("outline.php"), php);
  await expect(
    page.getByRole("treeitem", { name: "outline.html", exact: true }),
  ).toBeVisible();
  await open("outline.html");
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  const outline = page.getByRole("complementary", { name: "Document outline" });
  await expect(
    outline.getByRole("button", { name: "main#app, line 1", exact: true }),
  ).toBeVisible();
  await expect(
    outline.getByRole("button", {
      name: "h1 — Hello world, line 2",
      exact: true,
    }),
  ).toBeVisible();
  await outline
    .getByRole("button", { name: "section.hero, line 3", exact: true })
    .click();
  await page.keyboard.insertText("<!-- target -->");
  await save();
  expect(await disk("outline.html")).toBe(
    html.replace("<section", "<!-- target --><section"),
  );
  await page.keyboard.press(shortcut + "+z");
  await save();
  expect(await disk("outline.html")).toBe(html);
  await sourceFill(html.replace('class="hero"', 'id="updated"'));
  await expect(
    outline.getByRole("button", {
      name: "section#updated, line 3",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    outline.getByRole("button", { name: /section\.hero/ }),
  ).toHaveCount(0);
  expect(await disk("outline.html")).toBe(html);
  await save();
  await open("outline.php");
  await expect(
    outline.getByRole("button", { name: "render(), line 5", exact: true }),
  ).toBeVisible();
  await expect(
    outline.getByRole("button", { name: /section#updated|fake/ }),
  ).toHaveCount(0);
  await expect(
    outline.getByRole("button", {
      name: "section#content, line 8",
      exact: true,
    }),
  ).toBeVisible();
  await outline
    .getByRole("button", { name: "render(), line 5", exact: true })
    .click();
  await page.keyboard.insertText("/* target */");
  await save();
  expect(await disk("outline.php")).toBe(
    php.replace("public function", "/* target */public function"),
  );
  await page.keyboard.press(shortcut + "+z");
  await save();
  await page.screenshot({ path: "test-results/code-outline.png" });
  await page
    .getByRole("button", { name: "Close outline", exact: true })
    .click();
  await expect(outline).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show outline", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(errors).toEqual([]);
});

test("document outline covers code languages, Markdown navigation and unsupported files", async () => {
  const fixtures = [
    [
      "outline.js",
      "export class Client { run() {} }\nconst load = () => {};\n",
      "load(), line 4",
    ],
    [
      "outline.ts",
      "interface Client { run(): void; }\ntype ID = string;\n",
      "ID",
    ],
    ["outline.css", "@media screen { .hero { color:red; } }", ".hero"],
    [
      "outline.py",
      "class Client:\n    def run(self):\n        pass\n",
      "run()",
    ],
    ["outline.xml", '<root><item id="first" /></root>', "item#first"],
    [
      "outline.vue",
      '<template><main id="vue" /></template><script setup>function load() {}</script>',
      "main#vue",
    ],
    ["outline.json", '{"key": true}', null],
  ];
  // Default-on formatting changes line positions; labels must track the actual buffer.
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  const outline = page.getByRole("complementary", { name: "Document outline" });
  for (const [name, text, label] of fixtures) {
    await fs.writeFile(file(name), text);
    await expect(
      page.getByRole("treeitem", { name, exact: true }),
    ).toBeVisible();
    await open(name);
    if (label)
      await expect(
        outline.getByRole("button", {
          name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        }),
      ).toBeVisible();
    else
      await expect(outline).toContainText(
        "No document outline is available for this file type.",
      );
  }
  await fs.writeFile(
    file("outline.md"),
    "# Same\n\nFirst\n\n" +
      "Paragraph\n\n".repeat(80) +
      "## Same\n\nSecond\n\n```md\n# Fake\n```\n",
  );
  await expect(
    page.getByRole("treeitem", { name: "outline.md", exact: true }),
  ).toBeVisible();
  await open("outline.md");
  await expect(outline.getByRole("button", { name: /Same, line/ })).toHaveCount(
    2,
  );
  await expect(outline.getByRole("button", { name: /Fake/ })).toHaveCount(0);
  await outline
    .getByRole("button", { name: /Same, line/ })
    .nth(1)
    .click();
  await expect
    .poll(async () =>
      page.locator(".editor-pane.active h2").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      }),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await outline
    .getByRole("button", { name: /Same, line/ })
    .nth(1)
    .click();
  await page.keyboard.insertText("<!-- target -->");
  await save();
  expect(await disk("outline.md")).toContain("<!-- target -->## Same");
  expect(errors).toEqual([]);
});

test("image preview wheel zoom stays anchored, supports dragging and never edits the image", async () => {
  const { default: sharp } = await import("sharp");
  const original = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: "#598bae" },
  })
    .png()
    .toBuffer();
  await fs.writeFile(file("zoom.png"), original);
  await expect(
    page.getByRole("treeitem", { name: "zoom.png", exact: true }),
  ).toBeVisible();
  await open("zoom.png");
  const viewport = page.getByRole("region", { name: "Image viewport" });
  const image = viewport.getByRole("img");
  await expect(image).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeEnabled();
  const bounds = await viewport.boundingBox();
  const before = await image.boundingBox();
  const pointer = {
    x: bounds.x + bounds.width * 0.4,
    y: bounds.y + bounds.height * 0.55,
  };
  const sourcePoint = {
    x: (pointer.x - before.x) / before.width,
    y: (pointer.y - before.y) / before.height,
  };
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => (await image.boundingBox()).width)
    .toBeGreaterThan(before.width * 1.2);
  const after = await image.boundingBox();
  expect(
    Math.abs(after.x + sourcePoint.x * after.width - pointer.x),
  ).toBeLessThan(1);
  expect(
    Math.abs(after.y + sourcePoint.y * after.height - pointer.y),
  ).toBeLessThan(1);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
    ),
  ).toBe(1);
  await page.mouse.wheel(0, 120);
  await expect
    .poll(async () =>
      Math.abs((await image.boundingBox()).width - before.width),
    )
    .toBeLessThan(1);
  await page.mouse.down();
  await page.mouse.move(pointer.x + 90, pointer.y + 50, { steps: 5 });
  await page.mouse.up();
  const panned = await image.boundingBox();
  expect(Math.abs(panned.x - before.x - 90)).toBeLessThan(1);
  expect(Math.abs(panned.y - before.y - 50)).toBeLessThan(1);
  await viewport.dblclick();
  await expect
    .poll(async () => Math.abs((await image.boundingBox()).x - before.x))
    .toBeLessThan(1);
  await expect
    .poll(async () => Math.abs((await image.boundingBox()).y - before.y))
    .toBeLessThan(1);
  await viewport.focus();
  await page.keyboard.press("+");
  await expect
    .poll(async () => (await image.boundingBox()).width)
    .toBeGreaterThan(before.width);
  await page.keyboard.press("0");
  await expect
    .poll(async () =>
      Math.abs((await image.boundingBox()).width - before.width),
    )
    .toBeLessThan(1);
  expect(await fs.readFile(file("zoom.png"))).toEqual(original);
  expect(errors).toEqual([]);
});

test("image preview zoom limits, fit resize and per-tab state", async () => {
  const { default: sharp } = await import("sharp");
  const original = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: "#6e9d7a" },
  })
    .png()
    .toBuffer();
  await fs.writeFile(file("large.png"), original);
  await sharp({
    create: { width: 100, height: 60, channels: 3, background: "#c8886a" },
  })
    .png()
    .toFile(file("small.png"));
  await expect(
    page.getByRole("treeitem", { name: "large.png", exact: true }),
  ).toBeVisible();
  await open("large.png");
  const viewport = page.locator(".editor-pane.active .image-viewport");
  const image = viewport.getByRole("img");
  const fit = page.getByRole("button", {
    name: "Fit image to window",
    exact: true,
  });
  await expect(fit).toBeEnabled();
  await page
    .getByRole("button", { name: "Actual image size", exact: true })
    .click();
  await expect.poll(async () => (await image.boundingBox()).width).toBe(1600);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(async () => (await image.boundingBox()).width).toBe(2000);
  await open("small.png");
  await expect(
    page.getByRole("status", { name: "Image zoom", exact: true }),
  ).toHaveText("100%");
  await expect.poll(async () => (await image.boundingBox()).width).toBe(100);
  await open("large.png");
  await expect.poll(async () => (await image.boundingBox()).width).toBe(2000);
  const cancelled = await viewport.evaluate((node) => {
    let cancelled = true;
    const rect = node.getBoundingClientRect();
    for (let index = 0; index < 25; index++)
      cancelled =
        !node.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -10000,
            clientX: rect.x + rect.width / 2,
            clientY: rect.y + rect.height / 2,
            cancelable: true,
          }),
        ) && cancelled;
    return cancelled;
  });
  expect(cancelled).toBe(true);
  await expect(
    page.getByRole("status", { name: "Image zoom", exact: true }),
  ).toHaveText("1600%");
  await expect
    .poll(async () => (await image.boundingBox()).width)
    .toBe(1600 * 16);
  await viewport.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    for (let index = 0; index < 25; index++)
      node.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 10000,
          deltaMode: 1,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
          cancelable: true,
        }),
      );
  });
  await expect.poll(async () => (await image.boundingBox()).width).toBe(80);
  await fit.click();
  const initial = await image.boundingBox();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 700),
  );
  await expect
    .poll(async () => (await image.boundingBox()).width)
    .toBeLessThan(initial.width);
  const box = await viewport.boundingBox();
  const resized = await image.boundingBox();
  expect(resized.x).toBeGreaterThanOrEqual(box.x);
  expect(resized.y).toBeGreaterThanOrEqual(box.y);
  expect(resized.x + resized.width).toBeLessThanOrEqual(box.x + box.width);
  expect(resized.y + resized.height).toBeLessThanOrEqual(box.y + box.height);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.screenshot({ path: "test-results/image-zoom.png" });
  expect(await fs.readFile(file("large.png"))).toEqual(original);
  expect(errors).toEqual([]);
});

// Context menu workflows exercise the real Electron clipboard and editor history.
async function menuAction(name) {
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function readClipboard() {
  return app.evaluate(({ clipboard }) => clipboard.readText());
}
async function setClipboard(text, html = "") {
  await app.evaluate(({ clipboard, ClipboardItem }, data) => clipboard.write([new ClipboardItem({
    "text/plain": new Blob([data.text], { type: "text/plain" }),
    ...(data.html ? { "text/html": new Blob([data.html], { type: "text/html" }) } : {}),
  })]), { text, html });
}

test("context menus preserve visual selections, clipboard, history and input focus", async () => {
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await editor.locator("h1").click();
  await page.keyboard.press(shortcut + "+a");
  await editor.locator("h1").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Copy", exact: true })).toBeEnabled();
  await menuAction("Copy");
  await expect.poll(readClipboard).toContain("A quieter workspace");
  await setClipboard("Plain words", "<b>Rich words</b>");
  await editor.locator("h1").click({ button: "right" });
  await menuAction("Paste without formatting");
  await expect(editor).toHaveText("Plain words");
  await expect(editor.locator("strong")).toHaveCount(0);
  await editor.click({ button: "right" });
  await menuAction("Undo");
  await expect(editor.locator("h1")).toHaveText("A quieter workspace");
  await editor.locator("h1").click({ button: "right" });
  await menuAction("Redo");
  await expect(editor).toHaveText("Plain words");

  await page.keyboard.press(shortcut + "+n");
  const input = page.getByLabel("Name", { exact: true });
  await input.fill("Selection.md");
  await input.selectText();
  await input.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Select all", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(input).toBeFocused();
  await expect(page.getByRole("dialog", { name: "New document", exact: true })).toBeVisible();
  await input.click({ button: "right" });
  await menuAction("Copy");
  await expect.poll(readClipboard).toBe("Selection.md");
  await setClipboard("Pasted.md");
  await input.click({ button: "right" });
  await menuAction("Paste");
  await expect(input).toHaveValue("Pasted.md");
  await input.click({ button: "right" });
  await menuAction("Undo");
  await expect(input).toHaveValue("Selection.md");
  await input.click({ button: "right" });
  await menuAction("Redo");
  await expect(input).toHaveValue("Pasted.md");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(errors).toEqual([]);
});

test("context menus provide source search, replace, comments, formatting and clipboard", async () => {
  await open("src/example.js");
  const source = page.locator(".editor-pane.active .cm-content");
  await source.click();
  await page.keyboard.press(shortcut + "+a");
  await source.click({ button: "right" });
  await menuAction("Find selection");
  await expect(page.locator('.editor-pane.active input[name="search"]')).toHaveValue(/const greet/);
  await page.locator(".editor-pane.active .cm-panel button[name=close]").click();
  await source.click({ button: "right" });
  await menuAction("Replace");
  const replacement = page.locator('.editor-pane.active input[name="replace"]');
  await expect(replacement).toBeFocused();
  await replacement.fill("replacement");
  await replacement.selectText();
  await replacement.press("Shift+F10");
  await menuAction("Copy");
  await expect.poll(readClipboard).toBe("replacement");
  await page.locator(".editor-pane.active .cm-panel button[name=close]").click();
  await source.click({ button: "right" });
  await menuAction("Toggle comment");
  await expect(source).toContainText("//");
  await source.click({ button: "right" });
  await menuAction("Undo");
  await expect(source).not.toContainText("//");
  await sourceFill("const compact={value:1};");
  await source.click({ button: "right" });
  await menuAction("Format document");
  await expect(source).toContainText("const compact = { value: 1 };");
  await source.click({ button: "right" });
  await menuAction("Undo");
  await expect(source).toHaveText("const compact={value:1};");
  await source.click();
  await page.keyboard.press(shortcut + "+a");
  await source.press("Shift+F10");
  await menuAction("Cut");
  await expect(source).toHaveText("");
  await expect.poll(readClipboard).toBe("const compact={value:1};");
  await source.press("Shift+F10");
  await menuAction("Paste");
  await expect(source).toHaveText("const compact={value:1};");
  await open("src/example.py");
  await page.locator(".editor-pane.active .cm-content").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Format document", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("context menus address clicked table cells and retain undo and saved Markdown", async () => {
  await fs.writeFile(file("notes/welcome.md"), "# Table\n\n| A | B |\n| --- | --- |\n| first | one |\n| second | two |\n");
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  const rows = editor.locator("tr");
  await editor.locator("td").first().click();
  await editor.getByText("two", { exact: true }).click({ button: "right" });
  await menuAction("Insert row above");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText("first");
  await expect(rows.nth(2)).not.toContainText("second");
  await expect(rows.nth(3)).toContainText("second");
  await editor.getByText("two", { exact: true }).click({ button: "right" });
  await menuAction("Insert column left");
  await expect(rows.nth(3).locator("td")).toHaveCount(3);
  await expect(rows.nth(3).locator("td").nth(2)).toHaveText("two");
  await editor.getByText("two", { exact: true }).click({ button: "right" });
  await menuAction("Delete row");
  await expect(rows).toHaveCount(3);
  await expect(editor).not.toContainText("two");
  await editor.getByText("one", { exact: true }).click({ button: "right" });
  await menuAction("Delete column");
  await expect(rows.first().locator("th")).toHaveCount(2);
  await save();
  expect(await disk("notes/welcome.md")).toContain("first");
  expect(await disk("notes/welcome.md")).not.toContain("two");
  await editor.getByText("first", { exact: true }).click({ button: "right" });
  await menuAction("Delete table");
  await expect(editor.locator("table")).toHaveCount(0);
  await editor.locator("h1").click({ button: "right" });
  await menuAction("Undo");
  await expect(editor.locator("table")).toHaveCount(1);
  await editor.getByText("first", { exact: true }).click({ button: "right" });
  await menuAction("Insert row below");
  await expect(rows).toHaveCount(4);
  await editor.getByText("first", { exact: true }).click({ button: "right" });
  await menuAction("Insert column right");
  await expect(rows.nth(1).locator("td")).toHaveCount(3);
  await page.setViewportSize({ width: 900, height: 560 });
  await editor.getByText("first", { exact: true }).click();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Delete table", exact: true })).toBeVisible();
  const box = await page.getByRole("menu").boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(560);
  await page.getByRole("menu").screenshot({ path: "test-results/table-context-menu.png" });
  await menuAction("Delete table");
  await expect(editor.locator("table")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("context menus open, copy, edit and remove the clicked hyperlink", async () => {
  await fs.writeFile(file("notes/welcome.md"), "# Links\n\n[First](other.md) and [Second](../index.md).\n");
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await editor.getByText("First", { exact: true }).click();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Edit link", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await editor.getByText("Second", { exact: true }).click({ button: "right" });
  await menuAction("Copy link address");
  await expect.poll(readClipboard).toBe("../index.md");
  await editor.getByText("Second", { exact: true }).click({ button: "right" });
  await menuAction("Edit link");
  await expect(page.getByLabel("Link destination")).toHaveValue("../index.md");
  await page.getByLabel("Link destination").fill("other.md#other");
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  await expect(editor.locator("a", { hasText: "Second" })).toHaveAttribute("href", "other.md#other");
  await editor.getByText("First", { exact: true }).click({ button: "right" });
  await menuAction("Remove link");
  await expect(editor.locator("a")).toHaveCount(1);
  await expect(editor).toContainText("First and Second.");
  await save();
  expect(await disk("notes/welcome.md")).toContain("First and [Second](other.md#other)");
  await editor.getByText("Second", { exact: true }).click({ button: "right" });
  await menuAction("Open link");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute("data-tooltip", "notes/other.md");
  expect(errors).toEqual([]);
});

test("context menus target inactive tabs and stop bulk close on cancel", async () => {
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Markdown source mode", exact: true }).click();
  await sourceFill("# Saved through inactive tab\n");
  await open("src/example.py");
  await sourceFill("print('keep unsaved')\n");
  await open("notes/other.md");
  const welcome = page.locator('.editor-tab[data-tooltip="notes/welcome.md"]');
  const other = page.locator('.editor-tab[data-tooltip="notes/other.md"]');
  await welcome.click({ button: "right" });
  await menuAction("Save");
  await expect.poll(() => diskWhenPresent("notes/welcome.md")).toBe("# Saved through inactive tab\n");
  await expect(other).toHaveAttribute("aria-selected", "true");
  await welcome.click({ button: "right" });
  await menuAction("Copy file path");
  await expect.poll(readClipboard).toBe(file("notes/welcome.md"));
  await welcome.click({ button: "right" });
  await menuAction("Close tabs to the right");
  await expect(page.getByRole("dialog", { name: "Save example.py?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".editor-tab")).toHaveCount(3);
  await fs.writeFile(file("src/example.py"), "print('external change')\n");
  await expect(page.locator('.editor-tab[data-tooltip="src/example.py"] .warning')).toBeVisible();
  await welcome.click({ button: "right" });
  await menuAction("Close other tabs");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Resolve the external change");
  await expect(page.locator(".editor-tab")).toHaveCount(3);
  expect(await disk("src/example.py")).toBe("print('external change')\n");
  await welcome.click({ button: "right" });
  await menuAction("Close other tabs");
  await page.getByRole("button", { name: "Discard edits", exact: true }).click();
  await expect(page.locator(".editor-tab")).toHaveCount(1);
  await welcome.focus();
  await welcome.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Close other tabs", exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Close tabs to the right", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(welcome).toBeFocused();
  await page.getByRole("button", { name: "Toggle explorer", exact: true }).click();
  await welcome.click({ button: "right" });
  await menuAction("Reveal in explorer");
  await expect(page.getByRole("treeitem", { name: "notes/welcome.md", exact: true })).toHaveAttribute("aria-selected", "true");
  await welcome.click({ button: "right" });
  await menuAction("Close all tabs");
  await expect(page.locator(".editor-tab")).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function imageFixture() {
  const sharp = (await import("sharp")).default;
  const bytes = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#598bae" },
  })
    .png()
    .toBuffer();
  await fs.writeFile(file("assets/menu.png"), bytes);
  return bytes;
}
async function clipboardImageSize() {
  return app.evaluate(async ({ clipboard, nativeImage }) => {
    const item = (await clipboard.read()).find((item) =>
      item.types.includes("image/png"),
    );
    if (!item) return null;
    const data = await item.getType("image/png");
    return nativeImage
      .createFromBuffer(Buffer.from(await data.arrayBuffer()))
      .getSize();
  });
}
async function captureReveals() {
  await app.evaluate(({ shell }) => {
    globalThis.menuReveals = [];
    shell.showItemInFolder = (name) => {
      globalThis.menuReveals.push(name);
    };
  });
}
const revealAction =
  process.platform === "darwin"
    ? "Reveal in Finder"
    : "Reveal in File Explorer";

test("P2 menus apply selected-text formatting through mouse and keyboard submenus", async () => {
  await fs.writeFile(
    file("notes/welcome.md"),
    "# Formatting\n\nSelected words\n",
  );
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  const text = editor.locator("p").first();
  await text.click({ clickCount: 3 });
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Format", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("menu", { name: "Format", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Bold", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: "test-results/p2-format-menu.png" });
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("menuitem", { name: "Format", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(text.locator("strong")).toHaveText("Selected words");
  await text.click({ button: "right" });
  await menuAction("Format");
  await menuAction("Italic");
  await expect(text.locator("em")).toHaveText("Selected words");
  await text.click({ button: "right" });
  await menuAction("Format");
  await menuAction("Clear formatting");
  await expect(text.locator("strong,em")).toHaveCount(0);
  await text.click({ button: "right" });
  await menuAction("Format");
  await menuAction("Strikethrough");
  await expect(text.locator("s")).toHaveText("Selected words");
  await text.click({ button: "right" });
  await menuAction("Format");
  await menuAction("Inline code");
  await expect(text.locator("code")).toHaveText("Selected words");
  await text.click({ button: "right" });
  await menuAction("Format");
  await menuAction("Clear formatting");
  await text.click({ button: "right" });
  await menuAction("Format");
  await menuAction("Add link");
  await page.getByLabel("Link destination").fill("other.md");
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  await save();
  expect(await disk("notes/welcome.md")).toContain(
    "[Selected words](other.md)",
  );
  expect(errors).toEqual([]);
});

test("P2 menus copy and edit code blocks and target list and checklist items", async () => {
  await fs.writeFile(
    file("notes/welcome.md"),
    "# Blocks\n\n```js\nconst answer = 42;\n```\n\n- First\n- Second\n\n- [ ] Task one\n- [ ] Task two\n",
  );
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await editor.locator("pre").click({ button: "right" });
  await menuAction("Copy code");
  await expect.poll(readClipboard).toBe("const answer = 42;");
  await editor.locator("pre").click({ button: "right" });
  await menuAction("Change code language");
  const language = page.getByLabel("Code block language");
  await expect(language).toBeFocused();
  await language.fill("typescript");
  await editor.locator("pre").click({ button: "right" });
  await menuAction("Delete code block");
  await expect(editor.locator("pre")).toHaveCount(0);
  await editor.locator("h1").click({ button: "right" });
  await menuAction("Undo");
  await expect(editor.locator("pre code")).toHaveAttribute(
    "class",
    /language-typescript/,
  );
  await editor.getByText("First", { exact: true }).click();
  await editor.getByText("Second", { exact: true }).click({ button: "right" });
  await menuAction("Indent list item");
  await expect(editor.locator("ul ul")).toContainText("Second");
  await editor.getByText("Second", { exact: true }).click({ button: "right" });
  await menuAction("Outdent list item");
  await expect(editor.locator("ul ul")).toHaveCount(0);
  await editor.getByText("Second", { exact: true }).click({ button: "right" });
  await menuAction("List type");
  await expect(
    page.getByRole("menuitem", { name: "Bullet list", exact: true }),
  ).toBeDisabled();
  await menuAction("Numbered list");
  await expect(editor.locator("ol")).toContainText("Second");
  await editor.getByText("Second", { exact: true }).click({ button: "right" });
  await menuAction("List type");
  await menuAction("Checklist");
  await editor.getByText("Task one", { exact: true }).click();
  await editor
    .getByText("Task two", { exact: true })
    .click({ button: "right" });
  await menuAction("Mark complete");
  await expect(editor.locator('li[data-checked="true"]')).toContainText(
    "Task two",
  );
  await expect(
    editor.locator('li[data-checked="false"]', { hasText: "Task one" }),
  ).toHaveCount(1);
  await editor
    .getByText("Task two", { exact: true })
    .click({ button: "right" });
  await menuAction("Mark incomplete");
  await expect(editor.locator('li[data-checked="true"]')).toHaveCount(0);
  await save();
  expect(await disk("notes/welcome.md")).toContain("- [ ] Task two");
  await editor.getByText("Second", { exact: true }).click({ button: "right" });
  await menuAction("List type");
  await menuAction("Bullet list");
  await save();
  expect(await disk("notes/welcome.md")).toContain("```typescript");
  expect(await disk("notes/welcome.md")).toContain("- Task two");
  expect(errors).toEqual([]);
});

test("P2 menus copy inline image pixels, edit alt text, open viewer and preserve original bytes", async () => {
  const original = await imageFixture();
  await captureReveals();
  await fs.writeFile(
    file("notes/welcome.md"),
    "# Images\n\n![Original alt](../assets/menu.png)\n",
  );
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  const image = editor.locator("img[src]");
  await expect(image).toBeVisible();
  await image.click({ button: "right" });
  await menuAction("Copy image");
  await expect.poll(clipboardImageSize).toEqual({ width: 1200, height: 800 });
  await expect(page.locator(".save-state")).toContainText("Saved");
  await image.click({ button: "right" });
  await menuAction("Copy image address");
  await expect.poll(readClipboard).toBe("../assets/menu.png");
  await image.click();
  await page.keyboard.press("Shift+F10");
  await menuAction("Edit alternative text");
  await page.getByLabel("Image alternative text").fill("Updated alt");
  await page
    .getByRole("button", { name: "Apply alternative text", exact: true })
    .click();
  await expect(image).toHaveAttribute("alt", "Updated alt");
  await save();
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect(image).toHaveAttribute("alt", "Updated alt");
  await image.click({ button: "right" });
  await menuAction("Open in image viewer");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "assets/menu.png",
  );
  const viewport = page.getByRole("region", { name: "Image viewport" });
  await viewport.click({ button: "right" });
  await menuAction("Actual size (100%)");
  await expect(page.getByRole("status", { name: "Image zoom" })).toHaveText(
    "100%",
  );
  await viewport.press("Shift+F10");
  await menuAction("Zoom in");
  await expect(page.getByRole("status", { name: "Image zoom" })).toHaveText(
    "125%",
  );
  await viewport.click({ button: "right" });
  await menuAction("Zoom out");
  await expect(page.getByRole("status", { name: "Image zoom" })).toHaveText(
    "100%",
  );
  await viewport.click({ button: "right" });
  await menuAction("Fit to window");
  await expect(page.getByRole("status", { name: "Image zoom" })).not.toHaveText(
    "100%",
  );
  await viewport.click({ button: "right" });
  await menuAction("Copy file path");
  await expect.poll(readClipboard).toBe(file("assets/menu.png"));
  await viewport.click({ button: "right" });
  await menuAction(revealAction);
  expect(await app.evaluate(() => globalThis.menuReveals)).toEqual([
    file("assets/menu.png"),
  ]);
  await viewport.click({ button: "right" });
  await menuAction("Copy image");
  await expect.poll(clipboardImageSize).toEqual({ width: 1200, height: 800 });
  await open("notes/welcome.md");
  await image.click({ button: "right" });
  await menuAction("Remove image from document");
  await expect(image).toHaveCount(0);
  await save();
  expect(await disk("notes/welcome.md")).not.toContain("menu.png");
  expect(await fs.readFile(file("assets/menu.png"))).toEqual(original);
  await editor.locator("h1").click({ button: "right" });
  await menuAction("Undo");
  await expect(image).toHaveAttribute("alt", "Updated alt");
  const sharp = (await import("sharp")).default;
  for (const format of ["jpeg", "webp", "gif", "avif"]) {
    const bytes = await sharp({
      create: { width: 32, height: 24, channels: 3, background: "#598bae" },
    })
      .toFormat(format)
      .toBuffer();
    await fs.writeFile(file(`assets/copy.${format}`), bytes);
    await expect(
      page.getByRole("treeitem", {
        name: `assets/copy.${format}`,
        exact: true,
      }),
    ).toBeVisible();
    await open(`assets/copy.${format}`);
    await setClipboard(`before ${format}`);
    await page
      .getByRole("region", { name: "Image viewport" })
      .click({ button: "right" });
    await menuAction("Copy image");
    await expect.poll(clipboardImageSize).toEqual({ width: 32, height: 24 });
  }
  expect(errors).toEqual([]);
});

test("P2 menus preview and copy HTTPS images without creating local attachments", async () => {
  const bytes = await imageFixture();
  const url = "https://images.example.test/menu.png";
  await page.route(url, (route) =>
    route.fulfill({ contentType: "image/png", body: bytes }),
  );
  await app.evaluate(
    ({ net }, data) => {
      const original = net.fetch;
      net.fetch = (address, options) =>
        String(address) === data.url
          ? Promise.resolve(
              new Response(Buffer.from(data.bytes), {
                headers: { "Content-Type": "image/png" },
              }),
            )
          : original(address, options);
    },
    { url, bytes: [...bytes] },
  );
  await fs.writeFile(
    file("notes/welcome.md"),
    `# Remote\n\n![Remote image](${url})\n`,
  );
  await open("notes/welcome.md");
  const image = page.locator(".editor-pane.active .document-content img[src]");
  await expect(image).toBeVisible();
  await image.click({ button: "right" });
  await menuAction("Open in image viewer");
  const dialog = page.getByRole("dialog", {
    name: "Image preview",
    exact: true,
  });
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog
    .getByRole("region", { name: "Image viewport" })
    .click({ button: "right" });
  await menuAction("Copy image");
  await expect.poll(clipboardImageSize).toEqual({ width: 1200, height: 800 });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await fs.readdir(file("assets"))).toEqual(["menu.png"]);
  expect(errors).toEqual([]);
});

test("explorer offers Open in browser for supported files and reports browser launch errors", async () => {
  await fs.writeFile(file("assets/browser image.PNG"), Buffer.from([0, 1, 2]));
  await fs.writeFile(file("report.pdf"), "%PDF-1.4");
  await fs.mkdir(file("folder.html"));
  await app.evaluate(({ app }) => {
    globalThis.browserProtocols = [];
    app.getApplicationInfoForProtocol = async (url) => {
      globalThis.browserProtocols.push(url);
      throw new Error("Browser unavailable for test");
    };
  });
  for (const name of ["src/example.html", "assets/browser image.PNG", "report.pdf"]) {
    const item = page.getByRole("treeitem", { name, exact: true });
    await expect(item).toBeVisible();
    await item.click({ button: "right" });
    await menuAction("Open in browser");
    await expect(page.getByRole("alert")).toContainText("Browser unavailable for test");
    await page.getByRole("button", { name: "Dismiss menu error" }).click();
  }
  expect(await app.evaluate(() => globalThis.browserProtocols)).toEqual(["https://", "https://", "https://"]);
  for (const name of ["notes/welcome.md", "src/example.py", "assets", "folder.html"]) {
    await page.getByRole("treeitem", { name, exact: true }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Open in browser", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  const refused = await page.evaluate(async () => {
    const result = [];
    for (const name of ["../escape.html", "folder.html", "src/example.py"]) {
      try { await window.margin.openInBrowser(name); result.push(false); }
      catch { result.push(true); }
    }
    return result;
  });
  expect(refused).toEqual([true, true, true]);
  expect(await app.evaluate(() => globalThis.browserProtocols)).toHaveLength(3);
  expect(errors).toEqual([]);
});

test("P2 menus create in clicked folders and empty explorer space, copy paths and reveal safely", async () => {
  await captureReveals();
  await page
    .getByRole("treeitem", { name: "assets", exact: true })
    .click({ button: "right" });
  await menuAction("New folder here");
  await page.getByLabel("Name", { exact: true }).fill("Nested");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "assets/Nested", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("treeitem", { name: "assets/Nested", exact: true })
    .click({ button: "right" });
  await menuAction("Copy file path");
  await expect.poll(readClipboard).toBe(file("assets/Nested"));
  await page
    .getByRole("treeitem", { name: "assets/Nested", exact: true })
    .click({ button: "right" });
  await menuAction(revealAction);
  expect(await app.evaluate(() => globalThis.menuReveals)).toEqual([
    file("assets/Nested"),
  ]);
  const tree = page.getByRole("tree", { name: "Workspace files", exact: true });
  await tree.focus();
  await tree.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Move to Trash", exact: true }),
  ).toHaveCount(0);
  await menuAction("New folder here");
  await page.getByLabel("Name", { exact: true }).fill("Root folder");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect.poll(()=>fs.stat(file('Root folder')).then(stat=>stat.isDirectory()).catch(error=>{if(error.code==='ENOENT')return false;throw error;})).toBe(true);
  await tree.focus();
  await tree.press("Shift+F10");
  await menuAction("New document here");
  await page.getByLabel("Name", { exact: true }).fill("Root note.md");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect.poll(() => diskWhenPresent("Root note.md")).toBe("");
  const refused = await page.evaluate(async () => {
    const actions = [
      () => window.margin.copyPath("../escape"),
      () => window.margin.reveal("../escape"),
      () => window.margin.imageBytes("file:///etc/passwd"),
    ];
    return Promise.all(
      actions.map(async (action) => {
        try {
          await action();
          return false;
        } catch {
          return true;
        }
      }),
    );
  });
  expect(refused).toEqual([true, true, true]);
  expect(errors).toEqual([]);
});

test("P2 menus use terminal selection, real clipboard paste, links and view-only clearing", async () => {
  await page
    .getByRole("button", { name: "Toggle terminal", exact: true })
    .click();
  await page.getByRole("button", { name: "New terminal", exact: true }).click();
  const terminal = page.locator(".terminal-view.active");
  const input = terminal.locator(".xterm-helper-textarea");
  await expect(input).toBeVisible();
  await input.focus();
  await setClipboard(
    process.platform === "win32"
      ? "Set-Content p2-terminal.txt 'paste worked'; Write-Output 'P2_READY'"
      : "printf 'paste worked' > p2-terminal.txt; printf 'P2_READY\\n'",
  );
  await input.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Copy selection", exact: true }),
  ).toBeDisabled();
  await menuAction("Paste");
  await page.keyboard.press("Enter");
  await expect
    .poll(() => diskWhenPresent("p2-terminal.txt"))
    .toBe("paste worked" + (process.platform === "win32" ? "\r\n" : ""));
  await expect(terminal.locator(".xterm-rows")).toContainText("P2_READY");
  await input.press("Shift+F10");
  await menuAction("Select all");
  await input.press("Shift+F10");
  await menuAction("Copy selection");
  await expect.poll(readClipboard).toContain("P2_READY");
  await input.press("Shift+F10");
  await menuAction("Clear view");
  await expect(terminal.locator(".xterm-rows")).not.toContainText("P2_READY");
  const url = "https://example.test/menu";
  await input.focus();
  await page.keyboard.type(
    process.platform === "win32"
      ? `Write-Output '${url}'`
      : `printf '${url}\\n'`,
  );
  await page.keyboard.press("Enter");
  const output = terminal
    .locator(".xterm-rows > div")
    .filter({ hasText: url })
    .last();
  await expect(output).toBeVisible();
  const bounds = await output.getByText(url, { exact: true }).boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    { button: "right" },
  );
  await menuAction("Copy link address");
  await expect.poll(readClipboard).toBe(url);
  await app.evaluate(({ shell }) => {
    globalThis.menuExternal = [];
    shell.openExternal = async (url) => {
      globalThis.menuExternal.push(url);
    };
  });
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    { button: "right" },
  );
  await menuAction("Open link");
  expect(await app.evaluate(() => globalThis.menuExternal)).toEqual([url]);
  expect(errors).toEqual([]);
});

test("P3 section menus copy identical full titles and links in visual, source and outline", async () => {
  const path = "notes/section # (é).md";
  const longTitle = "A very long " + "section title ".repeat(20).trim();
  const original = `# Overview\n\nLead body.\n\n## Repeat **é** & tea\n\nBody.\n\n## Repeat **é** & tea\n\n### ${longTitle}\n\nEnd.\n`;
  await fs.writeFile(file(path), original);
  await expect(
    page.getByRole("treeitem", { name: path, exact: true }),
  ).toBeVisible();
  await open(path);
  const editor = page.locator(".editor-pane.active .document-content");
  const expected =
    "[Repeat é \\& tea](/notes/section%20%23%20%28%C3%A9%29.md#repeat-%C3%A9--tea-1)";
  await editor.locator("h2").last().click({ button: "right" });
  await menuAction("Copy section link");
  await expect.poll(readClipboard).toBe(expected);
  await editor.locator("h2").last().click();
  await page.keyboard.press("Shift+F10");
  await menuAction("Copy section title");
  await expect.poll(readClipboard).toBe("Repeat é & tea");
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  const outline = page.getByRole("complementary", { name: "Document outline" });
  const repeated = outline
    .locator(".outline-entry")
    .filter({ hasText: "Repeat é & tea" })
    .last();
  await repeated.click({ button: "right" });
  await menuAction("Copy section link");
  await expect.poll(readClipboard).toBe(expected);
  const long = outline
    .locator(".outline-entry")
    .filter({ hasText: "A very long" });
  await long.focus();
  await long.press("Shift+F10");
  await menuAction("Copy section title");
  await expect.poll(readClipboard).toBe(longTitle);
  await expect(long).toBeFocused();
  await editor.locator("h3").click({ button: "right" });
  await menuAction("Copy section title");
  await expect.poll(readClipboard).toBe(longTitle);
  await editor
    .getByText("Lead body.", { exact: true })
    .click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Copy section link", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  const source = page.locator(".editor-pane.active .cm-content");
  await source
    .locator(".cm-line")
    .filter({ hasText: "## Repeat **é** & tea" })
    .last()
    .click({ button: "right" });
  await menuAction("Copy section link");
  await expect.poll(readClipboard).toBe(expected);
  await expect(page.locator(".save-state")).toContainText("Saved");
  expect(await disk(path)).toBe(original);
  expect(errors).toEqual([]);
});

test("P3 section links navigate to the second matching heading from another note in both modes", async () => {
  const path = "notes/targets.md";
  const original =
    "\uFEFF---\r\ntitle: Target\r\n---\r\n" +
    (
      "# Start\n\n## Repeat\n\n" +
      "Body paragraph.\n\n".repeat(35) +
      "## Repeat\n\n" +
      "Tail paragraph.\n\n".repeat(35)
    ).replace(/\n/g, "\r\n");
  await fs.writeFile(file(path), original);
  await expect(
    page.getByRole("treeitem", { name: path, exact: true }),
  ).toBeVisible();
  await open(path);
  await page
    .locator(".editor-pane.active .document-content h2")
    .last()
    .click({ button: "right" });
  await menuAction("Copy section link");
  const copied = await readClipboard();
  expect(copied).toBe("[Repeat](/notes/targets.md#repeat-1)");
  await fs.writeFile(file("notes/other.md"), "# Links\n\nPaste here.\n");
  await open("notes/other.md");
  await page.locator(".editor-pane.active .document-content p").click({ clickCount: 3 });
  await page.keyboard.press(shortcut + "+v");
  const jump = page.locator(
    '.editor-pane.active .document-content a[href="/notes/targets.md#repeat-1"]',
  );
  await jump.click({ modifiers: [shortcut] });
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    path,
  );
  await expect
    .poll(() =>
      page
        .locator(".editor-pane.active .document-content h2")
        .last()
        .evaluate((heading) => {
          const viewport = heading
            .closest(".document-scroll")
            .getBoundingClientRect();
          return Math.abs(heading.getBoundingClientRect().top - viewport.top);
        }),
    )
    .toBeLessThan(80);
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await open("notes/other.md");
  await jump.click({ modifiers: [shortcut] });
  const source = page.locator(".editor-pane.active .cm-content");
  await expect(source).toBeFocused();
  await page.keyboard.insertText("TARGET ");
  await save();
  const second = original.lastIndexOf("## Repeat");
  expect(await disk(path)).toBe(
    original.slice(0, second) + "TARGET " + original.slice(second),
  );
  expect(errors).toEqual([]);
});

test("P3 section menus support protected Setext headings, unsaved changes and fenced exclusions", async () => {
  const path = "notes/welcome.md";
  const original =
    "\uFEFF---\r\ntitle: Protected\r\n---\r\n\r\n# Same\r\n\r\nSame\r\n----\r\n\r\n[[protected]]\r\n";
  await fs.writeFile(file(path), original);
  await open(path);
  const source = page.locator(".editor-pane.active .cm-content");
  await source
    .locator(".cm-line")
    .filter({ hasText: /^Same$/ })
    .click({ button: "right" });
  await menuAction("Copy section link");
  await expect.poll(readClipboard).toBe("[Same](/notes/welcome.md#same-1)");
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  const outline = page.getByRole("complementary", { name: "Document outline" });
  await outline.locator(".outline-entry").last().click({ button: "right" });
  await menuAction("Copy section title");
  await expect.poll(readClipboard).toBe("Same");
  await expect(page.locator(".save-state")).toContainText("Saved");
  expect(await disk(path)).toBe(original);
  await sourceFill(
    "# Draft\n\n## Fresh heading\n\n```md\n# Fake heading\n```\n",
  );
  await source
    .locator(".cm-line")
    .filter({ hasText: "## Fresh heading" })
    .click({ button: "right" });
  await menuAction("Copy section title");
  await expect.poll(readClipboard).toBe("Fresh heading");
  const fresh = outline
    .locator(".outline-entry")
    .filter({ hasText: "Fresh heading" });
  await fresh.click({ button: "right" });
  await menuAction("Copy section link");
  await expect
    .poll(readClipboard)
    .toBe("[Fresh heading](/notes/welcome.md#fresh-heading)");
  await source
    .locator(".cm-line")
    .filter({ hasText: "# Fake heading" })
    .click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Copy section title", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".save-state")).toContainText("Unsaved");
  expect(await disk(path)).toBe(original);
  expect(errors).toEqual([]);
});

test("P3 source regression preserves CRLF through formatting, undo and redo", async () => {
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Automatically format code on open", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Close preferences", exact: true })
    .click();
  const path = "src/example.json";
  const original = '{"a":1,\r\n"b":{"x":2}}\r\n';
  await fs.writeFile(file(path), original);
  await open(path);
  await expect(page.locator(".save-state")).toContainText("Saved");
  const source = page.locator(".editor-pane.active .cm-content");
  await source.click({ button: "right" });
  await menuAction("Format document");
  await expect(page.locator(".save-state")).toContainText("Unsaved");
  await save();
  const formatted = await disk(path);
  expect(formatted).toContain('\r\n  "a": 1,\r\n');
  expect(formatted.replace(/\r\n/g, "")).not.toContain("\n");
  await source.click({ button: "right" });
  await menuAction("Undo");
  await save();
  expect(await disk(path)).toBe(original);
  await source.click({ button: "right" });
  await menuAction("Redo");
  await save();
  expect(await disk(path)).toBe(formatted);
  expect(errors).toEqual([]);
});

test("QoL workspace search filters contents, includes dirty buffers and jumps to exact matches", async () => {
  await fs.writeFile(file("notes/other.md"), "# Search\n\nA QOLNEEDLE here.\n");
  await fs.writeFile(file("src/example.py"), "# QOLNEEDLE in source\n");
  await fs.mkdir(file("node_modules"));
  await fs.writeFile(file("node_modules/hidden.md"), "QOLNEEDLE");
  await page.keyboard.press(shortcut + "+Shift+f");
  const panel = page.getByRole("region", { name: "Workspace search" });
  await panel.getByLabel("Search workspace contents").fill("QOLNEEDLE");
  await expect(panel.getByRole("status")).toContainText("2 matches");
  await panel.getByLabel("Files to include").fill("*.md");
  await expect(panel.getByRole("status")).toContainText("1 matches");
  await panel.getByLabel("Files to exclude").fill("notes/**");
  await expect(panel.getByRole("status")).toContainText("0 matches");
  await panel.getByLabel("Files to exclude").fill("");
  await expect(panel.getByRole("status")).toContainText("1 matches");
  await page.screenshot({ path: "test-results/qol-workspace-search.png" });
  await panel
    .getByRole("button", {
      name: "notes/other.md, line 3, column 3",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Markdown source mode", exact: true }),
  ).toHaveClass("active");
  const source = page.locator(".editor-pane.active .cm-content");
  await expect(source).toBeFocused();
  await page.keyboard.insertText("MATCHED");
  await save();
  expect(await disk("notes/other.md")).toBe("# Search\n\nA MATCHED here.\n");
  await sourceFill("# Unsaved\n\nQOL_DRAFT_ONLY\n");
  await panel.getByLabel("Search workspace contents").fill("QOL_DRAFT_ONLY");
  await expect(panel.getByRole("status")).toContainText("1 matches");
  expect(await disk("notes/other.md")).not.toContain("QOL_DRAFT_ONLY");
  await sourceFill("");
  await panel.getByLabel("Search workspace contents").fill("MATCHED");
  await expect(panel.getByRole("status")).toContainText("0 matches");
  expect(errors).toEqual([]);
});

test("QoL visual find searches across formatting and replaces all in one undo step", async () => {
  const original =
    "# Search\n\nA nee**dle** and NEEDLE and needles.\n\n```js\nneedle\n```\n";
  await fs.writeFile(file("notes/welcome.md"), original);
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await page.keyboard.press(shortcut + "+f");
  const find = page.getByRole("search", { name: "Find in document" });
  await find.getByLabel("Find text").fill("needle");
  await expect(find.getByRole("status")).toHaveText("1 of 4");
  await find.getByLabel("Whole word", { exact: true }).check();
  await expect(find.getByRole("status")).toHaveText("1 of 3");
  await find.getByLabel("Match case", { exact: true }).check();
  await expect(find.getByRole("status")).toHaveText("1 of 2");
  await find.getByLabel("Find text").press("Enter");
  await expect(find.getByRole("status")).toHaveText("2 of 2");
  await find.getByLabel("Find text").press("Shift+Enter");
  await expect(find.getByRole("status")).toHaveText("1 of 2");
  await expect(page.locator(".save-state")).toContainText("Saved");
  await find
    .getByRole("button", { name: "Toggle replace", exact: true })
    .click();
  await find.getByLabel("Replace with").fill("found");
  await page.screenshot({ path: "test-results/qol-visual-find.png" });
  await find.getByRole("button", { name: "Replace all", exact: true }).click();
  await expect(editor.locator("p").first()).toHaveText(
    "A found and NEEDLE and needles.",
  );
  await expect(editor.locator("pre")).toHaveText("found");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("p").first()).toHaveText(
    "A needle and NEEDLE and needles.",
  );
  await expect(editor.locator("strong")).toHaveText("dle");
  await expect(editor.locator("pre")).toHaveText("needle");
  await find.getByLabel("Find text").press("Escape");
  await expect(find).toHaveCount(0);
  await expect(editor).toBeFocused();
  expect(await disk("notes/welcome.md")).toBe(original);
  expect(errors).toEqual([]);
});

test("QoL replace current advances past inserted matches and supports the replace shortcut", async () => {
  await fs.writeFile(file("notes/welcome.md"), "# Replace\n\nfoo foo\n");
  await open("notes/welcome.md");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Alt+f" : "Control+h",
  );
  const find = page.getByRole("search", { name: "Find in document" });
  await find.getByLabel("Find text").fill("foo");
  await find.getByLabel("Replace with").fill("foobar");
  await find
    .getByRole("button", { name: "Replace current", exact: true })
    .click();
  await find
    .getByRole("button", { name: "Replace current", exact: true })
    .click();
  await expect(
    page.locator(".editor-pane.active .document-content p"),
  ).toHaveText("foobar foobar");
  expect(errors).toEqual([]);
});

test("QoL navigation restores selections and scroll, supports forward and branches after Back", async () => {
  const original =
    "# First\n\nANCHOR_xyz\n\n" +
    "body\n\n".repeat(30) +
    "## Bottom\n\nTail.\n";
  await fs.writeFile(file("notes/welcome.md"), original);
  await open("notes/welcome.md");
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  let source = page.locator(".editor-pane.active .cm-content");
  await source.locator(".cm-line").filter({ hasText: "ANCHOR_xyz" }).click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowLeft" : "Home",
  );
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
  await open("notes/other.md");
  await page
    .getByRole("button", { name: "Navigate back", exact: true })
    .click();
  await expect(source).toBeFocused();
  await page.keyboard.insertText("BACK");
  await expect(source).toContainText("ANCHOR_BACK");
  await page.keyboard.press(shortcut + "+z");
  await page
    .getByRole("button", { name: "Navigate forward", exact: true })
    .click();
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "notes/other.md",
  );
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "notes/welcome.md",
  );
  await open("src/example.py");
  await expect(
    page.getByRole("button", { name: "Navigate forward", exact: true }),
  ).toBeDisabled();
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Document outline" })
    .getByRole("button", { name: /Bottom, line/ })
    .click();
  await expect(source).toBeFocused();
  await page.keyboard.insertText("JUMP ");
  await expect(source).toContainText("JUMP ## Bottom");
  await page.keyboard.press(shortcut + "+z");
  await page
    .getByRole("button", { name: "Navigate back", exact: true })
    .click();
  await expect(source).toBeFocused();
  await page.keyboard.insertText("RETURN");
  await expect(source).toContainText("ANCHOR_RETURN");
  expect(await disk("notes/welcome.md")).toBe(original);
  expect(errors).toEqual([]);
});

test("QoL mode switches retain formatted text selection and reading position", async () => {
  const original =
    "# Mode\n\n" +
    "Body paragraph.\n\n".repeat(35) +
    "Target **needle** here.\n\n" +
    "Tail paragraph.\n\n".repeat(35);
  await fs.writeFile(file("notes/welcome.md"), original);
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await editor.getByText("needle", { exact: true }).dblclick();
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  const source = page.locator(".editor-pane.active .cm-content");
  await expect(source).toBeFocused();
  await page.keyboard.insertText("SOURCE");
  await expect(source).toContainText("Target **SOURCE** here.");
  await page.keyboard.press(shortcut + "+z");
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.insertText("VISUAL");
  await expect(editor.locator("strong")).toHaveText("VISUAL");
  await expect
    .poll(() =>
      editor.locator("strong").evaluate((element) => {
        const viewport = element
          .closest(".document-scroll")
          .getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return (
          rect.top >= viewport.top - 5 && rect.bottom <= viewport.bottom + 5
        );
      }),
    )
    .toBe(true);
  expect(await disk("notes/welcome.md")).toBe(original);
  expect(errors).toEqual([]);
});

test("QoL session restores source caret, mode and scroll after restarting", async () => {
  const original =
    "# Resume\n\n" +
    "Body line.\n\n".repeat(50) +
    "## Remember\n\n" +
    "Tail line.\n\n".repeat(30);
  await fs.writeFile(file("notes/welcome.md"), original);
  await open("notes/welcome.md");
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Document outline" })
    .getByRole("button", { name: /Remember, line/ })
    .click();
  let source = page.locator(".editor-pane.active .cm-content");
  await expect(source).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  const expected = original.indexOf("Remember");
  await expect
    .poll(async () => {
      const saved = JSON.parse(
        await fs.readFile(path.join(data, "state.json"), "utf8"),
      );
      return saved.sessions[root]?.tabs[0]?.position?.sourceHead;
    })
    .toBe(expected);
  const scroll = await page
    .locator(".editor-pane.active .cm-scroller")
    .evaluate((element) => element.scrollTop);
  expect(scroll).toBeGreaterThan(100);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  source = page.locator(".editor-pane.active .cm-content");
  await expect(
    page.getByRole("button", { name: "Markdown source mode", exact: true }),
  ).toHaveClass("active");
  await expect(source).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator(".editor-pane.active .cm-scroller")
        .evaluate(
          (element, previous) => Math.abs(element.scrollTop - previous),
          scroll,
        ),
    )
    .toBeLessThan(50);
  await page.keyboard.insertText("RESUMED ");
  await save();
  expect(await disk("notes/welcome.md")).toBe(
    original.slice(0, expected) + "RESUMED " + original.slice(expected),
  );
  expect(errors).toEqual([]);
});

test("QoL closed tabs reopen once per shortcut, persist, and never resurrect discarded edits", async () => {
  const original = await disk("notes/welcome.md");
  await open("notes/welcome.md");
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await sourceFill("SECRET_DISCARDED_DRAFT");
  await page
    .getByRole("button", { name: "Close welcome.md", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", {name: "Document actions", exact: true}).click();
  await expect(page.getByRole("menuitem", { name: "Reopen closed tab", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Close welcome.md", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard edits", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await fs.readFile(path.join(data, "state.json"), "utf8")).includes(
        "SECRET_DISCARDED_DRAFT",
      ),
    )
    .toBe(false);
  await page.keyboard.press(shortcut + "+Shift+t");
  await expect(page.locator(".editor-tab")).toHaveCount(1);
  await expect(
    page.locator(".editor-pane.active .cm-content"),
  ).not.toContainText("SECRET_DISCARDED_DRAFT");
  await page.getByRole("button", {name: "Document actions", exact: true}).click();
  await expect(page.getByRole("menuitem", { name: "Reopen closed tab", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(await disk("notes/welcome.md")).toBe(original);
  await open("notes/other.md");
  await page
    .getByRole("button", { name: "Close welcome.md", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close other.md", exact: true })
    .click();
  await expect(page.locator(".editor-tab")).toHaveCount(0);
  await page.keyboard.press(shortcut + "+Shift+t");
  await expect(page.locator(".editor-tab")).toHaveCount(1);
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "notes/other.md",
  );
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"))
          .sessions[root].closedTabs.length,
    )
    .toBe(1);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await page.keyboard.press(shortcut + "+Shift+t");
  await expect(page.locator(".editor-tab")).toHaveCount(2);
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "notes/welcome.md",
  );
  expect(errors).toEqual([]);
});

test("QoL session restores a visual selection without modifying the note", async () => {
  const original =
    "# Visual resume\n\n" +
    "Body paragraph.\n\n".repeat(30) +
    "Target **needle** here.\n\n" +
    "Tail paragraph.\n\n".repeat(20);
  await fs.writeFile(file("notes/welcome.md"), original);
  await open("notes/welcome.md");
  let editor = page.locator(".editor-pane.active .document-content");
  await editor.getByText("needle", { exact: true }).dblclick();
  await expect
    .poll(async () => {
      const saved = JSON.parse(
        await fs.readFile(path.join(data, "state.json"), "utf8"),
      );
      return saved.sessions[root]?.tabs[0]?.position?.sourceHead;
    })
    .toBe(original.indexOf("needle") + "needle".length);
  const scroll = await page
    .locator(".editor-pane.active .document-scroll")
    .evaluate((element) => element.scrollTop);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  editor = page.locator(".editor-pane.active .document-content");
  await expect(editor).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator(".editor-pane.active .document-scroll")
        .evaluate(
          (element, previous) => Math.abs(element.scrollTop - previous),
          scroll,
        ),
    )
    .toBeLessThan(50);
  expect(await disk("notes/welcome.md")).toBe(original);
  await expect(page.locator(".save-state")).toContainText("Saved");
  await page.keyboard.insertText("RESUMED");
  await expect(editor.locator("strong")).toHaveText("RESUMED");
  await save();
  expect(await disk("notes/welcome.md")).toContain("Target **RESUMED** here.");
  expect(errors).toEqual([]);
});

test("QoL workspace results preserve source bytes with automatic formatting enabled", async () => {
  const original = "const QOL_FORMAT={value:1};\n";
  await fs.writeFile(file("src/example.js"), original);
  await page.keyboard.press(shortcut + "+Shift+f");
  const panel = page.getByRole("region", { name: "Workspace search" });
  await panel.getByLabel("Search workspace contents").fill("value:1");
  await expect(panel.getByRole("status")).toContainText("1 matches");
  await panel
    .getByRole("button", {
      name: "src/example.js, line 1, column 19",
      exact: true,
    })
    .click();
  const source = page.locator(".editor-pane.active .cm-content");
  await expect(source).toBeFocused();
  await expect(source).toHaveText(original.trim());
  await expect(page.locator(".save-state")).toContainText("Saved");
  expect(await disk("src/example.js")).toBe(original);
  await expect
    .poll(async () => {
      const saved = JSON.parse(
        await fs.readFile(path.join(data, "state.json"), "utf8"),
      );
      const tab = saved.sessions[root]?.tabs.find(
        (tab) => tab.path === "src/example.js",
      );
      return tab?.suppressAutoFormat && tab.position?.sourceHead;
    })
    .toBe(original.indexOf("value:1") + "value:1".length);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect(page.locator(".editor-pane.active .cm-content")).toBeFocused();
  await expect(page.locator(".editor-pane.active .cm-content")).toHaveText(
    original.trim(),
  );
  await expect(page.locator(".save-state")).toContainText("Saved");
  await page.keyboard.insertText("value:2");
  await save();
  expect(await disk("src/example.js")).toBe(
    original.replace("value:1", "value:2"),
  );
  expect(errors).toEqual([]);
});

test("P2 QoL Quick Open supports fuzzy filenames, recent files, line columns and session history", async () => {
  const original = "first\r\nsecond\r\nthird\r\n";
  await fs.writeFile(file("src/example.py"), original);
  await page.keyboard.press(shortcut + "+p");
  const palette = page.getByRole("dialog", { name: "Quick open", exact: true });
  await palette.getByLabel("Search files").fill("expy:2:3");
  await expect(
    palette.locator(".palette-results > button").first(),
  ).toContainText("example.py");
  await page.keyboard.press("Enter");
  const source = page.locator(".editor-pane.active .cm-content");
  await expect(source).toBeFocused();
  await page.keyboard.insertText("HERE");
  await save();
  expect(await disk("src/example.py")).toBe(
    original.replace("second", "seHEREcond"),
  );
  await open("notes/welcome.md");
  await open("notes/other.md");
  await page.keyboard.press(shortcut + "+p");
  await expect(
    palette.locator(".palette-results > button").first(),
  ).toContainText("other.md");
  await page.keyboard.press("Escape");
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"))
          .sessions[root]?.recentFiles[0],
    )
    .toBe("notes/other.md");
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await page.keyboard.press(shortcut + "+p");
  await expect(
    page
      .getByRole("dialog", { name: "Quick open", exact: true })
      .locator(".palette-results > button")
      .first(),
  ).toContainText("other.md");
  expect(errors).toEqual([]);
});

test("P2 QoL Save Copy retains dirty contents and Save As switches the file without overwriting the original", async () => {
  const original = await disk("notes/welcome.md");
  await open("notes/welcome.md");
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  const draft = "# Draft\n\n[Other](other.md#other)\n";
  await sourceFill(draft);
  const tab = () =>
    page.locator('.editor-tab[data-tooltip="notes/welcome.md"]');
  await tab().click({ button: "right" });
  await menuAction("Save a copy…");
  await page
    .getByLabel("Workspace-relative path", { exact: true })
    .fill("archive/copy.md");
  await page.getByRole("button", { name: "Save copy", exact: true }).click();
  await expect
    .poll(() => diskWhenPresent("archive/copy.md").catch(error=>{if(error.code==='ENOENT')return '';throw error;}))
    .toBe(draft.replace("other.md", "../notes/other.md"));
  await expect(tab()).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".save-state")).toContainText("Unsaved");
  expect(await disk("notes/welcome.md")).toBe(original);
  await tab().click({ button: "right" });
  await menuAction("Save as…");
  await page
    .getByLabel("Workspace-relative path", { exact: true })
    .fill("archive/copy.md");
  await page.getByRole("button", { name: "Save as", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(tab()).toHaveCount(1);
  await tab().click({ button: "right" });
  await menuAction("Save as…");
  await page
    .getByLabel("Workspace-relative path", { exact: true })
    .fill("notes/renamed.md");
  await page.getByRole("button", { name: "Save as", exact: true }).click();
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "notes/renamed.md",
  );
  await expect(tab()).toHaveCount(0);
  await expect(page.locator(".save-state")).toContainText("Saved");
  expect(await disk("notes/renamed.md")).toBe(draft);
  expect(await disk("notes/welcome.md")).toBe(original);
  expect(errors).toEqual([]);
});

test("P2 QoL outline follows caret and scroll, filters with ancestors and collapses sections", async () => {
  const original =
    "# Parent\n\n" +
    "intro\n\n".repeat(70) +
    "## Child\n\nchild text\n\n### Grandchild\n\nend\n";
  await fs.writeFile(file("notes/welcome.md"), original);
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Show outline", exact: true }).click();
  const outline = page.getByRole("complementary", { name: "Document outline" });
  const child = outline.getByRole("button", { name: /^Child, line/ });
  await child.click();
  await expect(child).toHaveAttribute("aria-current", "location");
  await outline
    .getByRole("button", { name: "Collapse Parent", exact: true })
    .click();
  await expect(child).toHaveCount(0);
  await outline.getByLabel("Filter outline").fill("Grandchild");
  await expect(
    outline.getByRole("button", { name: /^Parent, line/ }),
  ).toBeVisible();
  await expect(
    outline.getByRole("button", { name: /^Grandchild, line/ }),
  ).toBeVisible();
  await outline.getByLabel("Filter outline").fill("missing");
  await expect(outline).toContainText("No matching headings");
  await outline.getByLabel("Filter outline").fill("");
  await outline
    .getByRole("button", { name: "Expand Parent", exact: true })
    .click();
  await page
    .locator(".editor-pane.active .document-scroll")
    .evaluate((element) => (element.scrollTop = 0));
  await expect(
    outline.getByRole("button", { name: /^Parent, line/ }),
  ).toHaveAttribute("aria-current", "location");
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await child.click();
  await expect(child).toHaveAttribute("aria-current", "location");
  await page.screenshot({ path: "test-results/p2-qol-outline.png" });
  expect(await disk("notes/welcome.md")).toBe(original);
  await expect(page.locator(".save-state")).toContainText("Saved");
  expect(errors).toEqual([]);
});

test("P2 QoL tabs reorder by dragging and keyboard menu, pin across restart and survive bulk close", async () => {
  await open("notes/welcome.md");
  await open("notes/other.md");
  await open("src/example.py");
  const tab = (name) => page.locator(`.editor-tab[data-tooltip="${name}"]`);
  await tab("src/example.py").dragTo(tab("notes/welcome.md"));
  await expect(page.locator(".editor-tab").first()).toHaveAttribute(
    "data-tooltip",
    "src/example.py",
  );
  await tab("notes/other.md").click({ button: "right" });
  await menuAction("Pin tab");
  await expect(page.locator(".editor-tab").first()).toHaveAttribute(
    "data-tooltip",
    "notes/other.md",
  );
  await expect(tab("notes/other.md")).toHaveClass(/pinned/);
  await tab("notes/welcome.md").focus();
  await page.keyboard.press("Shift+F10");
  await menuAction("Move tab left");
  await expect(page.locator(".editor-tab").nth(1)).toHaveAttribute(
    "data-tooltip",
    "notes/welcome.md",
  );
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"))
          .sessions[root]?.tabs[0]?.pinned,
    )
    .toBe(true);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  const pinned = page.locator('.editor-tab[data-tooltip="notes/other.md"]');
  await expect(pinned).toHaveClass(/pinned/);
  await pinned.click({ button: "right" });
  await menuAction("Close all tabs");
  await expect(page.locator(".editor-tab")).toHaveCount(1);
  await expect(pinned).toBeVisible();
  await pinned.click({ button: "right" });
  await menuAction("Unpin tab");
  await expect(pinned).not.toHaveClass(/pinned/);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 700),
  );
  const names = Array.from(
    { length: 12 },
    (_, index) => `notes/qol-visible-tab-${String(index).padStart(2, "0")}.md`,
  );
  await Promise.all(
    names.map((name) => fs.writeFile(file(name), "# Tab view\n")),
  );
  for (const name of names) {
    await expect(
      page.getByRole("treeitem", { name, exact: true }),
    ).toBeVisible();
    await open(name);
  }
  const inView = () =>
    page.locator(".editor-tab.active").evaluate((element) => {
      const rect = element.getBoundingClientRect(),
        parent = element.closest(".tabs-scroll").getBoundingClientRect();
      return rect.left >= parent.left - 1 && rect.right <= parent.right + 1;
    });
  await expect.poll(inView).toBe(true);
  await page.keyboard.press(shortcut + "+p");
  await page
    .getByLabel("Search files", { exact: true })
    .fill("qol-visible-tab-00.md");
  await page.keyboard.press("Enter");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    names[0],
  );
  await expect.poll(inView).toBe(true);
  expect(errors).toEqual([]);
});

test("P2 QoL link picker uses dirty headings, duplicate anchors and encoded filenames without losing selection", async () => {
  const target = "notes/section space.md";
  await fs.writeFile(
    file(target),
    "# Target\n\n## Repeat\n\nFirst\n\n## Repeat\n\nSecond\n",
  );
  await expect(
    page.getByRole("treeitem", { name: target, exact: true }),
  ).toBeVisible();
  await open(target);
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await sourceFill(
    "# Target\n\n## Repeat\n\nFirst\n\n## Repeat\n\nSecond\n\n## Unsaved heading\n",
  );
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await editor.locator("strong").filter({ hasText: "ideas" }).dblclick();
  await page.keyboard.press(shortcut + "+k");
  await page
    .getByRole("button", { name: "Choose file or section", exact: true })
    .click();
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  const picker = page.getByRole("region", { name: "Workspace link picker" });
  await picker.getByLabel("Find link file").fill("sectionspace");
  await picker.getByRole("button", { name: target, exact: true }).click();
  await expect(
    picker.getByRole("button", { name: "Unsaved heading", exact: true }),
  ).toBeVisible();
  await picker
    .getByRole("button", { name: "Repeat", exact: true })
    .nth(1)
    .click();
  await expect(
    page.getByLabel("Link destination", { exact: true }),
  ).toHaveValue("/notes/section%20space.md#repeat-1");
  await page.screenshot({ path: "test-results/p2-qol-link-picker.png" });
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  const link = editor.locator('a[href="/notes/section%20space.md#repeat-1"]');
  await expect(link).toHaveText("ideas");
  await save();
  expect(await disk("notes/welcome.md")).toContain(
    "[**ideas**](/notes/section%20space.md#repeat-1)",
  );
  expect(await disk(target)).not.toContain("Unsaved heading");
  await link.click({ modifiers: [shortcut] });
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    target,
  );
  expect(errors).toEqual([]);
});

test("P2 QoL explorer supports roving arrows, parent navigation, typeahead and keyboard context menus", async () => {
  const tree = page.getByRole("tree", { name: "Workspace files" }),
    notes = tree.getByRole("treeitem", { name: "notes", exact: true });
  await notes.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(notes).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");
  await expect(notes).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(
    tree.getByRole("treeitem", { name: "notes/other.md", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    tree.getByRole("treeitem", { name: "notes/welcome.md", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(notes).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await expect(tree.getByRole("treeitem").first()).toBeFocused();
  await page.keyboard.type("src");
  await expect(
    tree.getByRole("treeitem", { name: "src", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const focused = tree.locator('[role="treeitem"]:focus');
  await expect(focused).toHaveAttribute("aria-label", /^src\//);
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Open terminal here", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await expect(page.locator(".editor-tab.active")).toBeVisible();
  expect(errors).toEqual([]);
});

test("P2 QoL terminal starts in the clicked directory with confined working paths", async () => {
  await page
    .getByRole("treeitem", { name: "src/example.py", exact: true })
    .click({ button: "right" });
  await menuAction("Open terminal here");
  await expect(page.locator(".terminal-tabs>div")).toHaveCount(1);
  const input = page.locator(".terminal-view.active .xterm-helper-textarea");
  await input.focus();
  const command =
    process.platform === "win32"
      ? "Set-Content -Path cwd-proof.txt -Value 'chosen directory'"
      : "printf 'chosen directory' > cwd-proof.txt";
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
  await expect
    .poll(() => diskWhenPresent("src/cwd-proof.txt").catch(() => ""))
    .toContain("chosen directory");
  await expect(page.locator(".terminal-tabs")).toContainText("src");
  const refused = await page.evaluate(async () => {
    try {
      await window.margin.terminalCreate("", "../");
      return false;
    } catch {
      return true;
    }
  });
  expect(refused).toBe(true);
  expect(errors).toEqual([]);
});

test("Compare files highlights HTML exercise and solution without opening or formatting them", async () => {
  const lines = [
    '<!doctype html>', '<html lang="nl">', '<body>',
    '<h1>Oefening</h2>',
    '<p title="' + 'x'.repeat(700) + '">Lange regel</p>',
    ...Array.from({ length: 85 }, (_, index) => `<p>Regel ${index}</p>`),
    '<a href="verkeerd.html">Link</a>', '</body>', '</html>', '',
  ];
  const exercise = lines.join('\r\n');
  const solution = lines.join('\n')
    .replace('<h1>Oefening</h2>', '<h1>Oefening</h1>')
    .replace('<p>Regel 40</p>', '<p>Toegevoegd</p>\n<p>Regel 40</p>')
    .replace('verkeerd.html', 'juist.html');
  await fs.writeFile(file('exercise.html'), exercise);
  await fs.writeFile(file('solution.html'), solution);
  await expect(page.getByRole('treeitem', { name: 'solution.html', exact: true })).toBeVisible();
  await open('notes/welcome.md');
  await documentAction('Compare files');
  const dialog = page.getByRole('dialog', { name: 'Compare files', exact: true });
  await dialog.getByLabel('Left file (exercise)', { exact: true }).selectOption('exercise.html');
  await dialog.getByLabel('Right file (solution)', { exact: true }).selectOption('solution.html');
  const columns = dialog.locator('.conflict-columns section');
  await expect(columns.first().locator('.diff-mine')).toContainText(['<h1>Oefening</h2>', 'verkeerd.html']);
  await expect(columns.nth(1).locator('.diff-disk')).toContainText(['<h1>Oefening</h1>', 'Toegevoegd', 'juist.html']);
  const gapIndex = await columns.first().locator('.diff-line').evaluateAll(rows => rows.findIndex(row => row.classList.contains('diff-gap')));
  expect(gapIndex).toBeGreaterThan(0);
  await expect(columns.nth(1).locator('.diff-line').nth(gapIndex)).toContainText('Toegevoegd');
  await expect(dialog.getByRole('group', { name: 'Difference navigation' })).toContainText('1 / 3 differences');
  await dialog.getByRole('button', { name: 'Next difference', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Difference navigation' })).toContainText('2 / 3 differences');
  const panes = dialog.locator('.diff-scroll');
  await expect.poll(() => panes.first().evaluate(el => el.scrollTop)).toBeGreaterThan(300);
  await dialog.getByRole('button', { name: 'Previous difference', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Difference navigation' })).toContainText('1 / 3 differences');
  await panes.first().evaluate(el => el.scrollTop = 500);
  await expect.poll(() => panes.nth(1).evaluate(el => el.scrollTop)).toBe(500);
  await panes.nth(1).evaluate(el => el.scrollTop = 200);
  await expect.poll(() => panes.first().evaluate(el => el.scrollTop)).toBe(200);
  await panes.first().evaluate(el => el.scrollLeft = 300);
  await expect.poll(() => panes.first().evaluate(el => el.scrollLeft)).toBe(300);
  await expect.poll(() => panes.nth(1).evaluate(el => el.scrollLeft)).toBe(0);
  await dialog.getByRole('button', { name: 'Swap files', exact: true }).click();
  await expect(dialog.getByLabel('Left file (exercise)', { exact: true })).toHaveValue('solution.html');
  await expect(columns.first().locator('.diff-mine')).toContainText(['Toegevoegd']);
  await dialog.getByRole('button', { name: 'Swap files', exact: true }).click();
  await expect(dialog.getByLabel('Left file (exercise)', { exact: true })).toHaveValue('exercise.html');
  await panes.first().evaluate(el => { el.scrollTop = 0; el.scrollLeft = 0; });
  await page.screenshot({ path: 'test-results/compare-files.png' });
  await dialog.getByLabel('Left file (exercise)', { exact: true }).selectOption('solution.html');
  await expect(dialog.locator('.diff-summary')).toContainText('No differences');
  await expect(dialog.getByRole('button', { name: 'Next difference', exact: true })).toBeDisabled();
  await expect(columns.locator('.diff-line.diff-mine, .diff-line.diff-disk')).toHaveCount(0);
  await expect(page.locator('.editor-tab')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Document actions', exact: true })).toBeFocused();
  expect(await disk('exercise.html')).toBe(exercise);
  expect(await disk('solution.html')).toBe(solution);
  expect(errors).toEqual([]);
});

test("Compare files uses dirty split buffers, handles unavailable files and marks limited previews", async () => {
  const exercise = 'start\nwrong\nend\n';
  const solution = 'start\ncorrect\nend\n';
  await fs.writeFile(file('exercise.txt'), exercise);
  await fs.writeFile(file('solution.txt'), solution);
  await expect(page.getByRole('treeitem', { name: 'solution.txt', exact: true })).toBeVisible();
  await open('exercise.txt');
  await open('solution.txt');
  await sourceFill(solution.replace('correct', 'unsaved solution'));
  const dialog = page.getByRole('dialog', { name: 'Compare files', exact: true });
  await page.locator('.editor-tab[data-tooltip="exercise.txt"]').click({ button: 'right' });
  await menuAction('Compare with current file');
  await expect(dialog.getByLabel('Left file (exercise)', { exact: true })).toHaveValue('solution.txt');
  await expect(dialog.locator('.diff-line.diff-mine')).toContainText(['unsaved solution']);
  await dialog.getByRole('button', { name: 'Close comparison', exact: true }).click();
  await page.locator('.editor-tab[data-tooltip="exercise.txt"]').click({ button: 'right' });
  await menuAction('Open beside current');
  await expect(page.locator('.editor-pane.split-visible')).toHaveCount(2);
  await documentAction('Compare files');
  await expect(dialog.getByLabel('Left file (exercise)', { exact: true })).toHaveValue('solution.txt');
  await expect(dialog.getByLabel('Right file (solution)', { exact: true })).toHaveValue('exercise.txt');
  await expect(dialog.locator('.diff-line.diff-mine')).toContainText(['unsaved solution']);
  await dialog.getByRole('button', { name: 'Close comparison', exact: true }).click();
  await expect(page.locator('.editor-pane.split-visible')).toHaveCount(2);
  await expect(page.locator('.editor-pane[data-path="solution.txt"] .cm-content')).toContainText('unsaved solution');
  expect(await disk('solution.txt')).toBe(solution);
  await page.locator('.editor-pane[data-path="solution.txt"] .cm-content').click();
  await page.getByRole('treeitem', { name: 'exercise.txt', exact: true }).click({ button: 'right' });
  await menuAction('Compare with current file');
  await expect(dialog.getByLabel('Right file (solution)', { exact: true })).toHaveValue('exercise.txt');
  await expect(dialog.locator('.diff-line.diff-mine')).toContainText(['unsaved solution']);
  await dialog.getByRole('button', { name: 'Close comparison', exact: true }).click();

  const huge = Array.from({ length: 5100 }, (_, i) => `line ${i}`).join('\n');
  await fs.writeFile(file('large-left.txt'), huge);
  await fs.writeFile(file('large-right.txt'), huge.replace('line 5099', 'different beyond preview'));
  await fs.writeFile(file('unavailable.txt'), 'available');
  await fs.writeFile(file('binary.dat'), Buffer.from([0, 1, 2, 3]));
  await expect(page.getByRole('treeitem', { name: 'unavailable.txt', exact: true })).toBeVisible();
  await documentAction('Compare files');
  await dialog.getByLabel('Left file (exercise)', { exact: true }).selectOption('large-left.txt');
  await dialog.getByLabel('Right file (solution)', { exact: true }).selectOption('large-right.txt');
  await expect(dialog).toContainText('Limited preview:');
  await expect(dialog.locator('.diff-summary')).toContainText('No differences in preview');
  await expect(dialog.locator('.diff-line')).toHaveCount(10000);
  await dialog.getByLabel('Right file (solution)', { exact: true }).selectOption('unavailable.txt');
  await expect(dialog.locator('.conflict-columns')).toContainText('available');
  await fs.rm(file('unavailable.txt'));
  await dialog.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('unavailable.txt');
  await expect(dialog.locator('.conflict-columns')).toHaveCount(0);
  await dialog.getByLabel('Right file (solution)', { exact: true }).selectOption('binary.dat');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('Right file (solution)', { exact: true }).selectOption('exercise.txt');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.locator('.conflict-columns')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('treeitem', { name: 'exercise.txt', exact: true }).click();
  await page.getByRole('treeitem', { name: 'solution.txt', exact: true }).click({ modifiers: [shortcut] });
  await page.getByRole('treeitem', { name: 'solution.txt', exact: true }).click({ button: 'right' });
  await menuAction('Compare selected files');
  await expect(dialog.getByLabel('Left file (exercise)', { exact: true })).toHaveValue('exercise.txt');
  await expect(dialog.getByLabel('Right file (solution)', { exact: true })).toHaveValue('solution.txt');
  await expect(dialog.locator('.diff-line.diff-disk')).toContainText(['unsaved solution']);
  await page.keyboard.press('Escape');
  expect(await disk('exercise.txt')).toBe(exercise);
  expect(await disk('solution.txt')).toBe(solution);
  expect(errors).toEqual([]);
});

test("P2 QoL conflicts highlight aligned line changes, synchronize scrolling and retain both versions", async () => {
  const original =
    Array.from({ length: 80 }, (_, index) => `line ${index}`).join("\n") + "\n";
  await fs.writeFile(file("src/example.py"), original);
  await open("src/example.py");
  const mine = original
    .replace("line 0", "long " + "x".repeat(700))
    .replace("line 2", "mine 2")
    .replace("line 60", "mine 60");
  await sourceFill(mine);
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  const external = original
    .replace("line 2", "external 2")
    .replace("line 20", "inserted\nline 20");
  await fs.writeFile(file("src/example.py"), external);
  await expect(
    page.locator(".editor-pane.active .conflict-banner"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "The file changed outside Margin",
    exact: true,
  });
  await expect(dialog.locator(".diff-mine")).toContainText([
    "mine 2",
    "mine 60",
  ]);
  await expect(dialog.locator(".diff-disk")).toContainText([
    "external 2",
    "inserted",
    "line 60",
  ]);
  const panes = dialog.locator(".diff-scroll");
  await panes.first().evaluate((element) => (element.scrollLeft = 300));
  await expect
    .poll(() => panes.first().evaluate((element) => element.scrollLeft))
    .toBe(300);
  await expect
    .poll(() => panes.nth(1).evaluate((element) => element.scrollLeft))
    .toBe(0);
  await panes.first().evaluate((element) => (element.scrollLeft = 0));
  await panes.first().evaluate((element) => (element.scrollTop = 500));
  await expect
    .poll(() => panes.nth(1).evaluate((element) => element.scrollTop))
    .toBe(500);
  await panes.nth(1).evaluate(element=>element.scrollTop=300);
  await expect.poll(()=>panes.first().evaluate(element=>element.scrollTop)).toBe(300);
  await panes.first().evaluate((element) => (element.scrollTop = 0));
  await expect
    .poll(() => panes.nth(1).evaluate((element) => element.scrollTop))
    .toBe(0);
  await page.screenshot({ path: "test-results/p2-qol-conflicts.png" });
  await dialog
    .getByRole("button", { name: "Keep reviewing", exact: true })
    .click();
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "mine 2",
  );
  expect(await disk("src/example.py")).toBe(external);
  expect(errors).toEqual([]);
});

test("spelling checks every occurrence, switches dictionaries, disables immediately and survives restart", async () => {
  const text = "# een qzxqzxqzx\n\neen verschillende qzxqzxqzx\n\n1. een qzxqzxqzx\n2. een **qzx**qzxqzx\n\n| een | qzxqzxqzx |\n| --- | --- |\n| een | verschillende |\n\n`qzxqzxqzx`\n\n```text\nqzxqzxqzx\n```\n";
  await fs.writeFile(file("notes/welcome.md"), text);
  await open("notes/welcome.md");
  let editor = page.locator(".editor-pane.active .document-content");
  const mistakes = () => editor.locator(".spelling-error").allTextContents();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Spellcheck language", { exact: true }).selectOption("nl");
  await page.getByRole("button", { name: "Close preferences" }).click();
  // One formatted word uses two decorations, but every occurrence has the same verdict.
  await expect.poll(mistakes).toEqual(["qzxqzxqzx", "qzxqzxqzx", "qzxqzxqzx", "qzx", "qzxqzx", "qzxqzxqzx"]);
  await expect(editor).toHaveAttribute("spellcheck", "false");
  await expect(editor).toHaveAttribute("lang", "nl");
  await expect(page.locator(".save-state")).toContainText("Saved");
  expect(await disk("notes/welcome.md")).toBe(text);

  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Spellcheck language", { exact: true }).selectOption("en-US");
  await page.getByRole("button", { name: "Close preferences" }).click();
  await expect.poll(mistakes, { timeout: 30000 }).toContain("verschillende");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Check spelling", { exact: true }).uncheck();
  await expect(page.getByLabel("Spellcheck language", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close preferences" }).click();
  await expect.poll(mistakes).toEqual([]);

  const saved = JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"));
  expect(saved.settings.spellcheckEnabled).toBe(false);
  expect(saved.settings.spellcheckLanguage).toBe("en-US");
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  editor = page.locator(".editor-pane.active .document-content");
  await expect.poll(mistakes).toEqual([]);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(page.getByLabel("Check spelling", { exact: true })).not.toBeChecked();
  await page.getByLabel("Check spelling", { exact: true }).check();
  await page.getByLabel("Spellcheck language", { exact: true }).selectOption("nl");
  await page.getByRole("button", { name: "Close preferences" }).click();
  await expect.poll(mistakes, { timeout: 30000 }).toHaveLength(6);

  // Edits, undo and external reload all invalidate the entire document verdict.
  await editor.locator("h1").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" qzxqzxqzx");
  await expect.poll(mistakes).toHaveLength(7);
  await page.keyboard.press(shortcut + "+z");
  await expect.poll(mistakes).toHaveLength(6);
  await save();
  await fs.writeFile(file("notes/welcome.md"), "# een\n\neen qzxqzxqzx\n\neen\n");
  await expect.poll(mistakes).toEqual(["qzxqzxqzx"]);
  await open("notes/other.md");
  await open("notes/welcome.md");
  await expect.poll(mistakes).toEqual(["qzxqzxqzx"]);
  expect(errors).toEqual([]);
});

test("spelling refreshes both split panes and source-mode edits with offline dictionaries", async () => {
  const original = "# een qzxqzxqzx\n\nverschillende\n";
  await fs.writeFile(file("notes/welcome.md"), original);
  await fs.writeFile(file("notes/other.md"), original);
  // The renderer does not need internet access to load or use a dictionary.
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Spellcheck language", { exact: true }).selectOption("nl");
  await page.getByLabel("Spellcheck language", { exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole("dialog", { name: "Preferences", exact: true }).screenshot({ path: "test-results/spelling-preferences.png" });
  await page.getByRole("button", { name: "Close preferences" }).click();
  await open("notes/welcome.md");
  await open("notes/other.md");
  await page.locator('.editor-tab[data-tooltip="notes/welcome.md"]').click({ button: "right" });
  await menuAction("Open beside current");
  const left = page.locator('.editor-pane[data-path="notes/other.md"]');
  const right = page.locator('.editor-pane[data-path="notes/welcome.md"]');
  await expect(left.locator(".spelling-error")).toHaveText(["qzxqzxqzx"]);
  await expect(right.locator(".spelling-error")).toHaveText(["qzxqzxqzx"]);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Spellcheck language", { exact: true }).selectOption("en-US");
  await page.getByRole("button", { name: "Close preferences" }).click();
  await expect(left.locator(".spelling-error").filter({ hasText: "verschillende" })).toHaveCount(1);
  await expect(right.locator(".spelling-error").filter({ hasText: "verschillende" })).toHaveCount(1);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Spellcheck language", { exact: true }).selectOption("fr");
  await page.getByLabel("Spellcheck language", { exact: true }).selectOption("nl");
  await page.getByRole("button", { name: "Close preferences" }).click();
  await expect(left.locator(".spelling-error")).toHaveText(["qzxqzxqzx"]);
  await expect(right.locator(".spelling-error")).toHaveText(["qzxqzxqzx"]);
  await right.locator("h1").click();
  await page.getByRole("button", { name: "Markdown source mode", exact: true }).click();
  await sourceFill("# een\n\neen\n");
  await page.getByRole("button", { name: "Visual mode", exact: true }).click();
  await expect(right.locator(".document-content")).toHaveText("eeneen");
  await expect(right.locator(".spelling-error")).toHaveCount(0);
  await expect(left.locator(".spelling-error")).toHaveText(["qzxqzxqzx"]);
  expect(await disk("notes/welcome.md")).toBe(original);
  const rejected = await page.evaluate(async () => {
    try { await window.margin.settings({ spellcheckLanguage: "unavailable" }); return false; }
    catch { return true; }
  });
  expect(rejected).toBe(true);
  expect(errors).toEqual([]);
});

test("P3 QoL reading settings apply without edits and persist across restart", async () => {
  const original = await disk("notes/welcome.md");
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Reading font size", { exact: true })
    .selectOption("22");
  await page
    .getByLabel("Reading line height", { exact: true })
    .selectOption("2.25");
  await page
    .getByLabel("Reading text width", { exact: true })
    .selectOption("960");
  await page
    .getByRole("button", { name: "Close preferences", exact: true })
    .click();
  const metrics = () =>
    page
      .locator(".editor-pane.active .document-content")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          font: style.fontSize,
          height: style.lineHeight,
          width: style.maxWidth,
        };
      });
  await expect
    .poll(metrics)
    .toEqual({ font: "22px", height: "49.5px", width: "960px" });
  await expect(page.locator(".save-state")).toContainText("Saved");
  expect(await disk("notes/welcome.md")).toBe(original);
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(path.join(data, "state.json"), "utf8"))
          .sessions[root]?.active,
    )
    .toBe("notes/welcome.md");
  const concurrent = await page.evaluate(async () => {
    await Promise.all([
      window.margin.settings({ historyLimitMB: 50 }),
      window.margin.settings({ readingWidth: 1100 }),
    ]);
    const saved = await window.margin.settings({});
    return { width: saved.readingWidth, limit: saved.historyLimitMB };
  });
  expect(concurrent).toEqual({ width: 1100, limit: 50 });
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await expect
    .poll(metrics)
    .toEqual({ font: "22px", height: "49.5px", width: "1100px" });
  expect(errors).toEqual([]);
});

test("P3 QoL local history compares saved versions, checkpoints dirty text and restores without overwriting disk", async () => {
  const name = "notes/welcome.md",
    original = await disk(name);
  await open(name);
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await sourceFill("# Second version\n");
  await save();
  await sourceFill("# Third version\n");
  await save();
  const versions = await page.evaluate(
    (name) => window.margin.historyList(name),
    name,
  );
  expect(versions).toHaveLength(2);
  const oldest = versions.at(-1).id;
  await sourceFill("# Unsaved before restore\n");
  await documentAction("Local version history");
  const history = page.getByRole("dialog", {
    name: "Local version history",
    exact: true,
  });
  await history
    .getByLabel("Saved version", { exact: true })
    .selectOption(oldest);
  await expect(
    history.getByRole("region", { name: "Current editor contents" }),
  ).toContainText("Unsaved before restore");
  await expect(
    history.getByRole("region", { name: "Selected saved version" }),
  ).toContainText("A quieter workspace");
  await page.screenshot({ path: "test-results/p3-history.png" });
  await history
    .getByRole("button", { name: "Restore to editor", exact: true })
    .click();
  await expect(history).toHaveCount(0);
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "A quieter workspace",
  );
  await expect(page.locator(".save-state")).toContainText("Unsaved");
  expect(await disk(name)).toBe("# Third version\n");
  const checkpoint = await page.evaluate(async (name) => {
    const list = await window.margin.historyList(name);
    return window.margin.historyRead(name, list[0].id);
  }, name);
  expect(checkpoint).toBe("# Unsaved before restore\n");
  await save();
  expect(await disk(name)).toBe(original);
  await move(name, "archive/welcome.md");
  await documentAction("Local version history");
  await expect(
    page
      .getByRole("dialog", { name: "Local version history", exact: true })
      .getByLabel("Saved version", { exact: true }),
  ).toContainText("Before restoring");
  expect(errors).toEqual([]);
});

test("P3 QoL slash menu inserts blocks by keyboard, supports undo and ignores code and inline paths", async () => {
  await fs.writeFile(file("notes/welcome.md"), "");
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await editor.click();
  await page.keyboard.type("/");
  const menu = page.getByRole("listbox", { name: "Insert block", exact: true });
  await expect(menu.getByRole("option")).toHaveCount(11);
  for (let index = 0; index < 8; index++)
    await page.keyboard.press("ArrowDown");
  const codeOption = menu.getByRole("option", {
    name: "Insert code block",
    exact: true,
  });
  await expect(codeOption).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() =>
      codeOption.evaluate((element) => {
        const row = element.getBoundingClientRect(),
          list = element.parentElement.getBoundingClientRect();
        return row.top >= list.top && row.bottom <= list.bottom;
      }),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/p3-slash-menu.png" });
  await page.keyboard.press("Escape");
  await page.keyboard.press(shortcut + "+a");
  await page.keyboard.insertText("/heading");
  await expect(menu.getByRole("option")).toHaveCount(3);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Slash heading");
  await expect(editor.locator("h2")).toHaveText("Slash heading");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await expect(
    menu.getByRole("option", { name: "Insert table", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator("table")).toHaveCount(1);
  await expect(editor.locator("table tr")).toHaveCount(3);
  await page.keyboard.press(shortcut + "+z");
  await expect(editor.locator("table")).toHaveCount(0);
  await expect(editor).toContainText("/table");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.keyboard.press(shortcut + "+a");
  await page.keyboard.insertText("/code");
  await expect(
    menu.getByRole("option", { name: "Insert code block", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await expect(menu).toHaveCount(0);
  await expect(editor.locator("pre")).toContainText("/table");
  await save();
  expect(await disk("notes/welcome.md")).toContain("```");
  expect(errors).toEqual([]);
});

test("P3 QoL slash image chooser preserves cancellation and inserts a real attachment", async () => {
  await fs.writeFile(file("notes/welcome.md"), "");
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await editor.click();
  await page.keyboard.type("/image");
  const menu = page.getByRole("listbox", { name: "Insert block", exact: true });
  await expect(
    menu.getByRole("option", { name: "Insert image", exact: true }),
  ).toBeVisible();
  await app.evaluate(({ dialog }) => {
    globalThis.__slashChooserCalls = 0;
    dialog.showOpenDialog = async () => {
      globalThis.__slashChooserCalls++;
      return { canceled: true, filePaths: [] };
    };
  });
  await page.keyboard.press("Enter");
  await expect
    .poll(() => app.evaluate(() => globalThis.__slashChooserCalls))
    .toBe(1);
  await expect(menu).toHaveAttribute("aria-busy", "false");
  await expect(editor).toContainText("/image");
  const image = path.join(base, "slash.png");
  await fs.writeFile(
    image,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, image);
  await editor.click();
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("option", { name: "Insert image", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator("img[src]")).toHaveCount(1);
  await save();
  expect(await disk("notes/welcome.md")).toContain("![Image]");
  expect(await fs.readdir(file("assets"))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("P3 QoL multi-selection cancels safely and batch moves preserve links between moved notes", async () => {
  const before = await disk("notes/welcome.md");
  await open("notes/welcome.md");
  await page
    .getByRole("treeitem", { name: "notes/other.md", exact: true })
    .click({ modifiers: [shortcut] });
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await expect(
    page.getByRole("tree", { name: "Workspace files" }),
  ).toHaveAttribute("aria-multiselectable", "true");
  await page
    .getByRole("button", { name: "Move selected items", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await disk("notes/welcome.md")).toBe(before);
  await page
    .getByRole("button", { name: "Move selected items", exact: true })
    .click();
  await page
    .getByLabel("Destination folder (empty = workspace root)", { exact: true })
    .fill("archive");
  await page
    .getByRole("button", { name: "Move & update links", exact: true })
    .click();
  await expect(
    page.getByRole("treeitem", { name: "archive/welcome.md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: "notes/welcome.md", exact: true }),
  ).toHaveCount(0);
  expect(await disk("archive/welcome.md")).toBe(before);
  expect(await disk("archive/other.md")).toContain(
    "welcome.md#small-beginnings",
  );
  expect(await disk("archive/other.md")).not.toContain("../notes");
  expect(await disk("index.md")).toContain("archive/welcome.md");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "archive/welcome.md",
  );
  expect(errors).toEqual([]);
});

test("explorer drags whole folders into folders and back to the workspace heading while updating links and tabs", async () => {
  await fs.writeFile(file("notes/other.md"), "[Welcome](welcome.md#small-beginnings) [Index](../index.md)\n");
  await open("notes/other.md");
  await page.getByRole("treeitem", { name: "notes", exact: true })
    .dragTo(page.getByRole("treeitem", { name: "archive", exact: true }));
  await expect(page.getByRole("treeitem", { name: "archive/notes/other.md", exact: true })).toBeVisible();
  await expect.poll(() => disk("index.md")).toBe("[Welcome](archive/notes/welcome.md)\n");
  expect(await disk("archive/notes/other.md")).toBe("[Welcome](welcome.md#small-beginnings) [Index](../../index.md)\n");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute("data-tooltip", "archive/notes/other.md");
  await page.getByRole("treeitem", { name: "archive/notes", exact: true }).dragTo(page.locator(".folder-heading"));
  await expect(page.getByRole("treeitem", { name: "notes/other.md", exact: true })).toBeVisible();
  expect(await disk("index.md")).toBe("[Welcome](notes/welcome.md)\n");
  expect(await disk("notes/other.md")).toBe("[Welcome](welcome.md#small-beginnings) [Index](../index.md)\n");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute("data-tooltip", "notes/other.md");
  expect(errors).toEqual([]);
});

test("explorer move picker searches nested destinations, previews full paths and supports the workspace root", async () => {
  await fs.mkdir(file("archive/deep"));
  const notes = page.getByRole("treeitem", { name: "notes", exact: true });
  await notes.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to folder…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Move notes", exact: true });
  await dialog.getByLabel("Find destination folder", { exact: true }).fill("deep");
  await dialog.getByRole("button", { name: "archive/deep", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("archive/deep/notes");
  await test.info().attach("move-folder-picker", { body: await page.screenshot(), contentType: "image/png" });
  await expect(dialog.getByRole("button", { name: "notes", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Move & update links", exact: true }).click();
  const moved = page.getByRole("treeitem", { name: "archive/deep/notes", exact: true });
  await expect(moved).toBeVisible();
  expect(await disk("index.md")).toContain("archive/deep/notes/welcome.md");
  await moved.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to folder…", exact: true }).click();
  await dialog.getByRole("button", { name: "Workspace root", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Move & update links", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("status")).toContainText("notes");
  await dialog.getByRole("button", { name: "Move & update links", exact: true }).click();
  await expect(notes).toBeVisible();
  expect(await disk("index.md")).toBe("[Welcome](notes/welcome.md)\n");
  expect(errors).toEqual([]);
});

// Controlled drag events let us hold the pointer still while testing hover timers
// and edge scrolling; the folder test above also exercises native mouse dragging.
async function explorerDragStart(name) {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await page.getByRole("treeitem", { name, exact: true }).dispatchEvent("dragstart", { dataTransfer: transfer });
  return transfer;
}
async function explorerDragOver(locator, transfer, position) {
  const rect = await locator.boundingBox();
  const coordinates = { clientX: rect.x + (position?.x ?? rect.width / 2), clientY: rect.y + (position?.y ?? rect.height / 2) };
  await locator.dispatchEvent("dragover", { dataTransfer: transfer, ...coordinates });
  return coordinates;
}

async function finishMarkdownDrop(target, transfer, point) {
  await target.dispatchEvent("drop", { dataTransfer: transfer, ...point });
  await page.evaluate(() => document.dispatchEvent(new DragEvent("dragend", { bubbles: true })));
}

test("dropping Markdown on a visual word previews and links that word without moving the file", async () => {
  const original = "# Drop\n\nHello **target** world.\n";
  await fs.writeFile(file("notes/welcome.md"), original);
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content"), word = editor.locator("strong");
  await expect(word).toHaveText("target");
  const transfer = await explorerDragStart("notes/other.md");
  const point = await explorerDragOver(word, transfer);
  await expect(page.locator(".markdown-link-drop-word")).toBeVisible();
  await expect(page.locator(".markdown-link-drop-preview")).toHaveText("Link “target” → notes/other.md");
  await expect(editor.locator("a")).toHaveCount(0);
  await expect(page.locator(".save-state")).toContainText("Saved");
  expect(await disk("notes/welcome.md")).toBe(original);
  await test.info().attach("word-link-drop", { body: await page.screenshot(), contentType: "image/png" });
  await finishMarkdownDrop(word, transfer, point);
  await expect(editor.getByRole("link", { name: "target", exact: true })).toHaveAttribute("href", "other.md");
  await expect(editor.getByRole("link", { name: "target", exact: true }).locator("strong")).toHaveText("target");
  await expect(page.locator(".markdown-link-drop-overlay")).toHaveCount(0);
  await editor.press(shortcut + "+z");
  await expect(editor.locator("a")).toHaveCount(0);
  await expect(word).toHaveText("target");
  await editor.press(shortcut + "+y");
  await expect(editor.getByRole("link", { name: "target", exact: true })).toBeVisible();
  await save();
  expect(await disk("notes/welcome.md")).toMatch(/\[(?:\*\*)?target(?:\*\*)?\]\(other\.md\)/);
  expect(await disk("notes/other.md")).toContain("# Other");
  expect(errors).toEqual([]);
});

test("dropping Markdown on an empty visual paragraph uses the encoded filename", async () => {
  const name = "notes/Café [draft] #1.md";
  await fs.writeFile(file(name), "# Draft\n");
  await fs.writeFile(file("notes/welcome.md"), "");
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  const paragraph = editor.locator("p").last();
  await expect(paragraph).toHaveText("");
  const transfer = await explorerDragStart(name);
  const point = await explorerDragOver(paragraph, transfer, { x: 8, y: 12 });
  await expect(page.locator(".markdown-link-drop-preview")).toHaveText(`Link “Café [draft] #1.md” → ${name}`);
  await expect(page.locator(".markdown-link-drop-caret")).toBeVisible();
  await finishMarkdownDrop(paragraph, transfer, point);
  const link = editor.getByRole("link", { name: "Café [draft] #1.md", exact: true });
  await expect(link).toHaveAttribute("href", "Caf%C3%A9%20%5Bdraft%5D%20%231.md");
  await save();
  expect(await disk(name)).toBe("# Draft\n");
  expect(errors).toEqual([]);
});

test("native Markdown dragging into a visual document creates a link", async () => {
  await fs.writeFile(file("notes/welcome.md"), "# Drop\n\n**Existing** text.\n");
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  await page.getByRole("treeitem", { name: "notes/other.md", exact: true }).dragTo(editor.locator("strong"));
  await expect(editor.getByRole("link", { name: "Existing", exact: true })).toHaveAttribute("href", "other.md");
  await expect(page.locator(".drag-source, .markdown-link-drop-overlay")).toHaveCount(0);
  await save();
  expect(await disk("notes/other.md")).toContain("# Other");
  expect(errors).toEqual([]);
});

test("dropping Markdown in blank visual space inserts its filename without joining neighboring text", async () => {
  await fs.writeFile(file("notes/welcome.md"), "# Drop\n\nParagraph.\n");
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content");
  const transfer = await explorerDragStart("notes/other.md");
  const point = await explorerDragOver(editor, transfer, { x: 70, y: 260 });
  await expect(page.locator(".markdown-link-drop-preview")).toHaveText("Link “other.md” → notes/other.md");
  await expect(page.locator(".markdown-link-drop-caret")).toBeVisible();
  await finishMarkdownDrop(editor, transfer, point);
  await expect(editor.getByRole("link", { name: "other.md", exact: true })).toHaveAttribute("href", "other.md");
  await expect(editor.locator("p").first()).toHaveText("Paragraph. other.md");
  await editor.press(shortcut + "+z");
  await expect(editor.locator("p").first()).toHaveText("Paragraph.");
  expect(errors).toEqual([]);
});

test("Markdown source drop previews a word and inserts a link as one undo step while preserving CRLF", async () => {
  const original = "# Source\r\n\r\nHello target world.\r\n\r\n";
  await fs.writeFile(file("notes/welcome.md"), original);
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Markdown source mode", exact: true }).click();
  const editor = page.locator(".editor-pane.active .cm-content"), line = editor.locator(".cm-line").filter({ hasText: "Hello target world." });
  const point = await line.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const offset = node.textContent.indexOf("target");
      if (offset < 0) continue;
      const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 6);
      const rect = range.getBoundingClientRect();
      return { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };
    }
  });
  const transfer = await explorerDragStart("notes/other.md");
  await line.dispatchEvent("dragover", { dataTransfer: transfer, ...point });
  await expect(page.locator(".markdown-link-drop-preview")).toHaveText("Link “target” → notes/other.md");
  await expect(page.locator(".markdown-link-drop-word")).toBeVisible();
  await finishMarkdownDrop(line, transfer, point);
  await expect(editor).toContainText("Hello [target](other.md) world.");
  await editor.press(shortcut + "+z");
  await expect(editor).toContainText("Hello target world.");
  await expect(editor).not.toContainText("[target]");
  await editor.press(process.platform === "darwin" ? "Meta+Shift+z" : "Control+y");
  await expect(editor).toContainText("Hello [target](other.md) world.");
  await save();
  expect(await disk("notes/welcome.md")).toBe(original.replace("target", "[target](other.md)"));
  expect(await disk("notes/other.md")).toContain("# Other");
  expect(errors).toEqual([]);
});

test("Markdown source drops on a blank line use the literal filename as link text", async () => {
  const portable = "archive/[Draft] notes.md";
  await fs.writeFile(file(portable), "# Draft\n");
  await fs.writeFile(file("notes/welcome.md"), "# Source\n\n");
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Markdown source mode", exact: true }).click();
  const editor = page.locator(".editor-pane.active .cm-content"), blank = editor.locator(".cm-line").last();
  const transfer = await explorerDragStart(portable);
  const point = await explorerDragOver(blank, transfer, { x: 6, y: 8 });
  await expect(page.locator(".markdown-link-drop-preview")).toHaveText("Link “[Draft] notes.md” → archive/[Draft] notes.md");
  await expect(page.locator(".markdown-link-drop-caret")).toBeVisible();
  await finishMarkdownDrop(blank, transfer, point);
  await expect(editor).toContainText("[\\[Draft\\] notes.md](../archive/%5BDraft%5D%20notes.md)");
  await save();
  expect(await disk("notes/welcome.md")).toBe("# Source\n\n[\\[Draft\\] notes.md](../archive/%5BDraft%5D%20notes.md)");
  expect(errors).toEqual([]);
});

test("cancelling a Markdown link drop clears its preview without edits and folders do not become links", async () => {
  await open("notes/welcome.md");
  const editor = page.locator(".editor-pane.active .document-content"), word = editor.locator("strong").first();
  const original = await disk("notes/welcome.md");
  const transfer = await explorerDragStart("notes/other.md");
  await explorerDragOver(word, transfer);
  await expect(page.locator(".markdown-link-drop-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".markdown-link-drop-overlay")).toHaveCount(0);
  await expect(page.locator(".save-state")).toContainText("Saved");
  const folder = await explorerDragStart("notes");
  await explorerDragOver(word, folder);
  await expect(page.locator(".markdown-link-drop-overlay")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await disk("notes/welcome.md")).toBe(original);
  expect(errors).toEqual([]);
});

test("explorer highlights destinations, opens hovered folders, rejects self moves and clears on cancel", async () => {
  await fs.mkdir(file("archive/nested"));
  const archive = page.getByRole("treeitem", { name: "archive", exact: true });
  if (await archive.getAttribute("aria-expanded") === "true") await archive.click();
  const transfer = await explorerDragStart("notes");
  const point = await explorerDragOver(archive, transfer);
  await expect(archive).toHaveClass(/drop-target/);
  await expect(page.locator(".explorer-drop-status")).toContainText("Move to archive/notes");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(archive).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("treeitem", { name: "archive/nested", exact: true })).toBeVisible();
  await test.info().attach("folder-destination", { body: await page.screenshot(), contentType: "image/png" });
  await archive.dispatchEvent("drop", { dataTransfer: transfer, ...point });
  const moved = page.getByRole("treeitem", { name: "archive/notes", exact: true });
  await expect(moved).toBeVisible();
  const self = await explorerDragStart("archive/notes");
  const selfPoint = await explorerDragOver(page.getByRole("treeitem", { name: "archive/notes/other.md", exact: true }), self);
  await expect(moved).toHaveClass(/drop-invalid/);
  await expect(page.locator(".explorer-drop-status")).toContainText("cannot be moved into itself");
  await moved.dispatchEvent("drop", { dataTransfer: self, ...selfPoint });
  await expect(moved).toBeVisible();
  expect(await disk("index.md")).toContain("archive/notes/welcome.md");
  await explorerDragStart("archive/notes");
  await explorerDragOver(archive, self);
  await page.keyboard.press("Escape");
  await expect(page.locator(".explorer-drop-status")).toHaveCount(0);
  await expect(page.locator(".drop-target, .drop-invalid, .drag-source")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("explorer scrolls long lists with a stationary drag pointer in both directions and stops outside the tree", async () => {
  await Promise.all(Array.from({ length: 90 }, (_, i) => fs.writeFile(file(`notes/item-${String(i).padStart(3, "0")}.md`), "# Item\n")));
  await expect(page.getByRole("treeitem", { name: "notes/item-089.md", exact: true })).toHaveCount(1);
  const tree = page.getByRole("tree", { name: "Workspace files", exact: true });
  await tree.evaluate((element) => { element.scrollTop = 0; });
  const transfer = await explorerDragStart("notes");
  const rect = await tree.boundingBox();
  await explorerDragOver(tree, transfer, { x: 60, y: rect.height - 5 });
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(400);
  await explorerDragOver(tree, transfer, { x: 60, y: rect.height / 2 });
  const stopped = await tree.evaluate((element) => element.scrollTop);
  await explorerDragOver(tree, transfer, { x: 60, y: 5 });
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeLessThan(stopped - 200);
  await tree.dispatchEvent("dragleave", { relatedTarget: null });
  const outside = await tree.evaluate((element) => element.scrollTop);
  await expect(page.locator(".explorer-drop-status")).toHaveCount(0);
  await page.waitForTimeout(150);
  expect(await tree.evaluate((element) => element.scrollTop)).toBe(outside);
  await page.keyboard.press("Escape");
  await expect(tree).not.toHaveClass(/is-dragging/);
  expect(errors).toEqual([]);
});

test("explorer blocks colliding drops and targets a file's containing folder", async () => {
  await fs.writeFile(file("archive/other.md"), "# Existing\n");
  await expect(page.getByRole("treeitem", { name: "archive/other.md", exact: true })).toBeVisible();
  const archive = page.getByRole("treeitem", { name: "archive", exact: true });
  const transfer = await explorerDragStart("notes/other.md");
  const collision = await explorerDragOver(archive, transfer);
  await expect(archive).toHaveClass(/drop-invalid/);
  await expect(page.locator(".explorer-drop-status")).toContainText("already exists");
  await archive.dispatchEvent("drop", { dataTransfer: transfer, ...collision });
  expect(await disk("archive/other.md")).toBe("# Existing\n");
  expect(await disk("notes/other.md")).toContain("welcome.md");
  const index = await explorerDragStart("index.md");
  const target = page.getByRole("treeitem", { name: "notes/other.md", exact: true });
  const point = await explorerDragOver(target, index);
  await expect(page.getByRole("treeitem", { name: "notes", exact: true })).toHaveClass(/drop-target/);
  await expect(page.locator(".explorer-drop-status")).toContainText("Move to notes/index.md");
  await target.dispatchEvent("drop", { dataTransfer: index, ...point });
  await expect(page.getByRole("treeitem", { name: "notes/index.md", exact: true })).toBeVisible();
  expect(await disk("notes/index.md")).toBe("[Welcome](welcome.md)\n");
  await fs.mkdir(file("cancel"));
  await expect(page.getByRole("treeitem", { name: "cancel", exact: true })).toBeVisible();
  await page.getByRole("treeitem", { name: "notes/index.md", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to folder…", exact: true }).click();
  await page.getByRole("group", { name: "Destination folders", exact: true })
    .getByRole("button", { name: "cancel", exact: true }).click();
  await page.getByRole("button", { name: "Move & update links", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: "cancel/index.md", exact: true })).toBeVisible();
  expect(await disk("cancel/index.md")).toBe("[Welcome](../notes/welcome.md)\n");
  expect(errors).toEqual([]);
});

test("explorer drags multiple selected folders together", async () => {
  await page.getByRole("treeitem", { name: "src", exact: true }).click();
  const notes = page.getByRole("treeitem", { name: "notes", exact: true });
  await notes.click({ modifiers: [shortcut] });
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await notes.dragTo(page.getByRole("treeitem", { name: "archive", exact: true }));
  await expect(page.getByRole("treeitem", { name: "archive/src", exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "archive/notes", exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(2);
  expect(await disk("archive/src/example.py")).toContain("def greet");
  expect(await disk("index.md")).toBe("[Welcome](archive/notes/welcome.md)\n");
  expect(errors).toEqual([]);
});

test("P3 QoL selection keyboard ranges and Trash preflight retain failed items and warn about incoming references", async () => {
  await fs.writeFile(file("notes/a.md"), "# A");
  await fs.writeFile(file("notes/b.md"), "# B");
  await fs.writeFile(file("index.md"), "[a](notes/a.md) [b](notes/b.md)");
  const a = page.getByRole("treeitem", { name: "notes/a.md", exact: true }),
    b = page.getByRole("treeitem", { name: "notes/b.md", exact: true });
  await expect(a).toBeVisible();
  await a.click();
  await a.focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await expect(b).toBeFocused();
  await page.keyboard.press("Delete");
  const confirm = page.getByRole("dialog", {
    name: "Move 2 selected items to Trash?",
    exact: true,
  });
  await expect(confirm).toContainText("index.md");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await disk("notes/a.md")).toBe("# A");
  await app.evaluate(
    async ({ shell }, target) => {
      const fs = process.getBuiltinModule("fs").promises;
      shell.trashItem = async (file) => {
        if (file.endsWith("b.md")) throw new Error("fixture locked file");
        await fs.rename(file, target);
      };
    },
    path.join(base, "trashed-a.md"),
  );
  await page
    .getByRole("button", { name: "Trash selected items", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move selection to Trash", exact: true })
    .click();
  await expect(a).toHaveCount(0);
  await expect(b).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("fixture locked file");
  expect(await disk("notes/b.md")).toBe("# B");
  expect(await fs.readFile(path.join(base, "trashed-a.md"), "utf8")).toBe(
    "# A",
  );
  expect(errors).toEqual([]);
});

test("P3 QoL split documents edit and scroll independently, restore across restart and keep tabs on closing split", async () => {
  const a = "# Left\n\n" + "Left paragraph.\n\n".repeat(120),
    b = "# Right\n\n" + "Right paragraph.\n\n".repeat(120);
  await fs.writeFile(file("notes/welcome.md"), a);
  await fs.writeFile(file("notes/other.md"), b);
  await open("notes/welcome.md");
  await open("notes/other.md");
  await page
    .locator('.editor-tab[data-tooltip="notes/welcome.md"]')
    .click({ button: "right" });
  await menuAction("Open beside current");
  await expect(page.locator(".editor-pane.split-visible")).toHaveCount(2);
  let left = page.locator('.editor-pane[data-path="notes/other.md"]'),
    right = page.locator('.editor-pane[data-path="notes/welcome.md"]');
  await left.locator("h1").click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowRight" : "End",
  );
  await page.keyboard.type(" edited");
  await right.locator("h1").click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowRight" : "End",
  );
  await page.keyboard.type(" edited");
  await page.keyboard.press(shortcut + "+Shift+s");
  await expect
    .poll(() => diskWhenPresent("notes/other.md"))
    .toContain("# Right edited");
  await expect
    .poll(() => diskWhenPresent("notes/welcome.md"))
    .toContain("# Left edited");
  await page
    .getByRole("button", { name: "Markdown source mode", exact: true })
    .click();
  await expect(right.locator(".cm-content")).toBeVisible();
  await expect(left.locator(".document-content")).toBeVisible();
  await left
    .locator(".document-scroll")
    .evaluate((element) => (element.scrollTop = 350));
  await right
    .locator(".cm-scroller")
    .evaluate((element) => (element.scrollTop = 750));
  await expect
    .poll(() =>
      left.locator(".document-scroll").evaluate((element) => element.scrollTop),
    )
    .toBe(350);
  await expect
    .poll(async () => {
      const saved = JSON.parse(
        await fs.readFile(path.join(data, "state.json"), "utf8"),
      ).sessions[root];
      return (
        !!saved?.split &&
        saved.tabs.find((tab) => tab.path === "notes/other.md")?.position
          ?.scrollTop
      );
    })
    .toBe(350);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  left = page.locator('.editor-pane[data-path="notes/other.md"]');
  right = page.locator('.editor-pane[data-path="notes/welcome.md"]');
  await expect(page.locator(".editor-pane.split-visible")).toHaveCount(2);
  await expect
    .poll(() =>
      left.locator(".document-scroll").evaluate((element) => element.scrollTop),
    )
    .toBe(350);
  await expect
    .poll(() =>
      right
        .locator(".cm-scroller")
        .evaluate((element) => Math.abs(element.scrollTop - 750)),
    )
    .toBeLessThan(2);
  await page.screenshot({ path: "test-results/p3-split.png" });
  await page
    .getByRole("button", { name: "Close split view", exact: true })
    .click();
  await expect(page.locator(".editor-area")).not.toHaveClass(/split/);
  await expect(page.locator(".editor-tab")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("P3 QoL split mode routes new documents into the focused pane and preserves reference files through moves", async () => {
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Split editor", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Quick open", exact: true }),
  ).toContainText("CHOOSE A SECOND DOCUMENT");
  await page.keyboard.press("Escape");
  await page.keyboard.press(shortcut + "+p");
  await page.getByLabel("Search files", { exact: true }).fill("other.md");
  await page.keyboard.press("Enter");
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    "notes/other.md",
  );
  await expect(page.locator(".editor-area")).not.toHaveClass(/split/);
  await page
    .getByRole("button", { name: "Close other.md", exact: true })
    .click();
  await page.getByRole("button", { name: "Split editor", exact: true }).click();
  await page.getByLabel("Search files", { exact: true }).fill("other.md");
  await page.keyboard.press("Enter");
  await expect(page.locator(".editor-pane.split-visible")).toHaveCount(2);
  const other = page.locator('.editor-pane[data-path="notes/other.md"]');
  await other.locator(".document-content").click();
  await page.keyboard.press(shortcut + "+p");
  await page.getByLabel("Search files", { exact: true }).fill("index.md");
  await page.keyboard.press("Enter");
  await expect(page.locator('.editor-pane[data-path="index.md"]')).toHaveClass(
    /split-visible/,
  );
  await expect(
    page.locator('.editor-pane[data-path="notes/welcome.md"]'),
  ).toHaveClass(/split-visible/);
  await expect(other).not.toHaveClass(/split-visible/);
  await move("notes/welcome.md", "archive/welcome.md");
  await expect(
    page.locator('.editor-pane[data-path="archive/welcome.md"]'),
  ).toHaveClass(/split-visible/);
  await expect(page.locator('.editor-pane[data-path="index.md"]')).toHaveClass(
    /split-visible/,
  );
  expect(await disk("index.md")).toContain("archive/welcome.md");
  expect(errors).toEqual([]);
});

test("UX clarity search scopes preserve the query and Explorer batch mode stays out of normal navigation", async () => {
  await open("notes/welcome.md");
  await expect(page.locator(".selection-actions")).toHaveCount(0);
  await page.locator(".global-search").click();
  const palette = page.getByRole("dialog", { name: "Quick open", exact: true });
  const scopes = palette.getByRole("navigation", { name: "Search scope" });
  await palette
    .getByLabel("Search files", { exact: true })
    .fill("New document");
  await scopes.getByRole("button", { name: "Commands", exact: true }).click();
  await expect(page.getByLabel("Search commands", { exact: true })).toHaveValue(
    "New document",
  );
  await page
    .getByRole("dialog", { name: "Command palette", exact: true })
    .getByRole("button", { name: /New.*document/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "New document", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".global-search").click();
  await page.getByLabel("Search files", { exact: true }).fill("Words and work");
  await page
    .getByRole("navigation", { name: "Search scope" })
    .getByRole("button", { name: "Contents", exact: true })
    .click();
  await expect(
    page.getByLabel("Search workspace contents", { exact: true }),
  ).toHaveValue("Words and work");
  await expect(
    page.getByLabel("Search workspace contents", { exact: true }),
  ).toBeFocused();
  await page.locator(".workspace-search-result").first().click();
  await expect(page.locator(".editor-pane.active .cm-content")).toContainText(
    "Words and work",
  );
  await expect
    .poll(() => page.evaluate(() => getSelection().toString()))
    .toBe("Words and work");
  await page
    .getByRole("button", { name: "Show explorer", exact: true })
    .click();
  const batch = page.getByRole("button", { name: "Select files", exact: true });
  await batch.click();
  await expect(batch).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".selection-actions")).toContainText("0 selected");
  await expect(
    page.getByRole("button", { name: "Move selected items", exact: true }),
  ).toBeDisabled();
  const active = await page
    .locator(".editor-tab.active")
    .getAttribute("data-tooltip");
  await page
    .getByRole("treeitem", { name: "notes/other.md", exact: true })
    .click();
  await expect(page.locator(".editor-tab.active")).toHaveAttribute(
    "data-tooltip",
    active,
  );
  await expect(page.locator(".selection-actions")).toContainText("1 selected");
  await page
    .getByRole("treeitem", { name: "notes/welcome.md", exact: true })
    .click();
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await page.keyboard.press("ArrowUp");
  // Explorer keyboard navigation focuses the target on the next animation frame.
  await expect(page.getByRole("treeitem", { name: "notes/other.md", exact: true })).toBeFocused();
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await page.keyboard.press("Space");
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await page
    .getByRole("button", { name: "Done selecting files", exact: true })
    .click();
  await expect(page.locator(".selection-actions")).toHaveCount(0);
  await open("notes/welcome.md");
  await page
    .getByRole("treeitem", { name: "notes/other.md", exact: true })
    .click({ modifiers: [shortcut] });
  await expect(page.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator(".selection-actions")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("UX clarity preferences search, category reset, cancellation and persistence preserve other preferences", async () => {
  const original = await disk("notes/welcome.md");
  await open("notes/welcome.md");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  const prefs = page.getByRole("dialog", { name: "Preferences", exact: true });
  await expect(
    prefs.getByLabel("Search preferences", { exact: true }),
  ).toBeFocused();
  await expect(prefs).toContainText("Changes apply immediately");
  await prefs
    .getByLabel("Reading font size", { exact: true })
    .selectOption("24");
  await prefs.getByLabel("Attachment folder", { exact: true }).fill("pictures");
  await prefs.getByLabel("Attachment folder", { exact: true }).press("Enter");
  await prefs
    .getByRole("navigation", { name: "Preferences categories" })
    .getByRole("button", { name: "Images & attachments", exact: true })
    .click();
  await expect(
    prefs.getByLabel("Reading font size", { exact: true }),
  ).toBeHidden();
  await expect(
    prefs.getByLabel("Attachment folder", { exact: true }),
  ).toHaveValue("pictures");
  await prefs
    .getByRole("button", { name: "Restore category defaults…", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Restore default preferences?", exact: true })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    prefs.getByLabel("Attachment folder", { exact: true }),
  ).toHaveValue("pictures");
  await prefs
    .getByRole("button", { name: "Restore category defaults…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore defaults", exact: true })
    .click();
  await expect(
    prefs.getByLabel("Attachment folder", { exact: true }),
  ).toHaveValue("assets");
  await prefs
    .getByLabel("Search preferences", { exact: true })
    .fill("reading font");
  await expect(
    prefs.getByLabel("Reading font size", { exact: true }),
  ).toHaveValue("24");
  await expect(
    prefs.getByLabel("Autosave policy", { exact: true }),
  ).toBeHidden();
  await prefs
    .getByLabel("Search preferences", { exact: true })
    .fill("nothing-matches-this");
  await expect(prefs).toContainText("No preferences match");
  await expect(
    prefs.getByRole("button", {
      name: "Restore matching defaults…",
      exact: true,
    }),
  ).toBeDisabled();
  await prefs
    .getByLabel("Search preferences", { exact: true })
    .fill("autosave");
  await expect(
    prefs.getByLabel("Autosave policy", { exact: true }),
  ).toHaveValue("off");
  await prefs
    .getByRole("button", { name: "Close preferences", exact: true })
    .click();
  expect(await disk("notes/welcome.md")).toBe(original);
  await app.evaluate(({ app }) => app.exit());
  await app.close().catch(() => {});
  await launch();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(
    page.getByLabel("Reading font size", { exact: true }),
  ).toHaveValue("24");
  await expect(
    page.getByLabel("Attachment folder", { exact: true }),
  ).toHaveValue("assets");
  await expect(page.getByLabel("Autosave policy", { exact: true })).toHaveValue(
    "off",
  );
  await page
    .getByRole("dialog", { name: "Preferences", exact: true })
    .screenshot({ path: "test-results/ux-preferences.png" });
  await page.getByLabel("Ignored directories", { exact: true }).fill("assets");
  await page.getByLabel("Ignored directories", { exact: true }).press("Enter");
  await page
    .getByRole("button", { name: "Restore all defaults…", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore defaults", exact: true })
    .click();
  await expect(
    page.getByLabel("Reading font size", { exact: true }),
  ).toHaveValue("17");
  await expect(page.getByLabel("Autosave policy", { exact: true })).toHaveValue(
    "afterDelay",
  );
  await expect(
    page.getByLabel("Ignored directories", { exact: true }),
  ).toHaveValue(/node_modules/);
  await page
    .getByRole("button", { name: "Close preferences", exact: true })
    .click();
  await expect(
    page.getByRole("treeitem", { name: "assets", exact: true }),
  ).toBeVisible();
  expect(await disk("notes/welcome.md")).toBe(original);
  expect(errors).toEqual([]);
});

test("UX clarity readable contrast, compact document actions and keyboard access work in both themes", async () => {
  await open("notes/welcome.md");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Toggle theme", exact: true })
        .click();
    const metrics = await page.evaluate(() => {
      const luminance = (color) => {
        const rgb = color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((n) => n / 255)
          .map((n) =>
            n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
          );
        return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      };
      return [
        ".save-state",
        ".status-bar",
        ".sidebar-footer",
        ".workspace-badge",
      ].map((selector) => {
        const element = document.querySelector(selector),
          style = getComputedStyle(element);
        let parent = element;
        while (
          parent &&
          getComputedStyle(parent).backgroundColor === "rgba(0, 0, 0, 0)"
        )
          parent = parent.parentElement;
        const fg = luminance(style.color),
          bg = luminance(getComputedStyle(parent).backgroundColor);
        return {
          selector,
          contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
          font: parseFloat(style.fontSize),
        };
      });
    });
    for (const metric of metrics) {
      expect(
        metric.contrast,
        `${theme} ${metric.selector}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(metric.font).toBeGreaterThanOrEqual(11);
    }
  }
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(820, 650),
  );
  await expect(page.locator(".save-state")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Writing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Navigation", exact: true }),
  ).toBeVisible();
  const actions = page.getByRole("button", {
    name: "Document actions",
    exact: true,
  });
  await actions.scrollIntoViewIfNeeded();
  await actions.focus();
  await expect(actions).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "Local version history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Compare files", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(actions).toBeFocused();
  await page.screenshot({ path: "test-results/ux-compact-dark.png" });
  await documentAction("Local version history");
  await expect(
    page.getByRole("dialog", { name: "Local version history", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close history", exact: true })
    .click();
  expect(errors).toEqual([]);
});
