import test from "node:test";
import assert from "node:assert/strict";
import { documentOutline } from "../src/lib/outline.ts";

const entries = async (path, text) =>
  (await documentOutline(path, text)).entries;

test("HTML outline nests tags, identifies headings and includes embedded JS/CSS", async () => {
  const text = [
    '<main id="app" class="wide page">',
    "<!-- <h1>Fake heading</h1> -->",
    "<h1>Hello <em>world</em></h1>",
    "<style>@media screen { .hero { color: red; } }</style>",
    '<script>const sample = "function fake() {}"; function greet() {}</script>',
    "</main>",
  ].join("\r\n");
  const result = await entries("page.HTML", text);
  assert.equal(result[0].label, "main#app.wide.page");
  const heading = result.find((item) => item.label === "h1 — Hello world");
  assert.equal(heading.depth, 1);
  assert.equal(heading.line, 3);
  assert.equal(heading.from, text.indexOf("<h1>Hello"));
  assert.equal(result.find((item) => item.label === "em").depth, 2);
  assert.ok(result.some((item) => item.label === "@media screen"));
  assert.ok(result.some((item) => item.label === ".hero"));
  assert.ok(result.some((item) => item.label === "greet()"));
  assert.ok(!result.some((item) => /Fake|fake/.test(item.label)));
});

test("mixed PHP/HTML keeps original offsets, nesting and real declarations", async () => {
  const text = [
    '<main id="app">',
    "<?php",
    "namespace App\\Http;",
    "// function fake() {}",
    '$example = "<h2>Not markup</h2>";',
    "class Controller {",
    "  public function render() {}",
    "}",
    "?>",
    '<section class="hero"><h2>Welcome</h2></section>',
    "</main>",
  ].join("\n");
  const result = await entries("page.phtml", text);
  assert.deepEqual(
    result.map((item) => item.label),
    [
      "main#app",
      "App\\Http",
      "Controller",
      "render()",
      "section.hero",
      "h2 — Welcome",
    ],
  );
  const method = result.find((item) => item.label === "render()");
  assert.equal(method.depth, 2);
  assert.equal(method.line, 7);
  assert.equal(method.from, text.indexOf("public function"));
  assert.equal(result.find((item) => item.label === "section.hero").depth, 1);
});

test("PHP classes, traits, interfaces, enums and functions ignore commented declarations", async () => {
  const text =
    "<?php /* class Fake {} */ interface Contract { function run(); } trait Shared { function work() {} } enum State { case Ready; } class Job { function run() {} } function execute() {}";
  const result = await entries("worker.php", text);
  assert.deepEqual(
    result.map((item) => [item.label, item.kind]),
    [
      ["Contract", "interface"],
      ["run()", "method"],
      ["Shared", "trait"],
      ["work()", "method"],
      ["State", "enum"],
      ["Job", "class"],
      ["run()", "method"],
      ["execute()", "fn"],
    ],
  );
});

test("TypeScript symbols and named arrows retain exact positions on the same line", async () => {
  const text =
    'interface Thing { go(): void; }\ntype ID = string; enum Color { Red }\nclass Box { run() {} }\nconst one = () => {}, two = function() {};\nitems.map(() => {});\nconst example = "class Fake {}";';
  const result = await entries("app.ts", text);
  assert.deepEqual(
    result.map((item) => item.label),
    ["Thing", "go()", "ID", "Color", "Box", "run()", "one()", "two()"],
  );
  assert.equal(result.find((item) => item.label === "run()").depth, 1);
  assert.equal(
    result.find((item) => item.label === "two()").from,
    text.indexOf("two ="),
  );
});

test("Vue, SCSS, XML and Python use their own syntax trees", async () => {
  const vue = await entries(
    "Page.vue",
    '<template><main><h1>Title</h1></main></template><script setup lang="ts">function load() {}</script><style>.hero { color: red }</style>',
  );
  assert.ok(vue.some((item) => item.label === "h1 — Title"));
  assert.ok(vue.some((item) => item.label === "load()"));
  assert.ok(vue.some((item) => item.label === ".hero"));
  const css = await entries("style.scss", ".hero { &:hover { color:red; } }");
  assert.deepEqual(
    css.map((item) => [item.label, item.depth]),
    [
      [".hero", 0],
      ["&:hover", 1],
    ],
  );
  const xml = await entries(
    "diagram.svg",
    '<svg><g id="layer"><path /></g></svg>',
  );
  assert.deepEqual(
    xml.map((item) => [item.label, item.depth]),
    [
      ["svg", 0],
      ["g#layer", 1],
      ["path", 2],
    ],
  );
  const python = await entries(
    "main.py",
    "class Box:\n    def run(self):\n        pass\ndef load():\n    pass\n",
  );
  assert.deepEqual(
    python.map((item) => [item.label, item.depth]),
    [
      ["Box", 0],
      ["run()", 1],
      ["load()", 0],
    ],
  );
});

test("Markdown skips frontmatter and fenced examples and indexes duplicate headings", async () => {
  const text =
    "\uFEFF---\r\ntitle: Demo\r\n---\r\n# Same\r\n\r\n```md\r\n# Fake\r\n```\r\n\r\n## Same\r\n\r\nOther\r\n=====\r\n";
  const result = await entries("note.md", text);
  assert.deepEqual(
    result.map((item) => [
      item.label,
      item.line,
      item.depth,
      item.headingIndex,
    ]),
    [
      ["Same", 4, 0, 0],
      ["Same", 10, 1, 1],
      ["Other", 12, 0, 2],
    ],
  );
});

test("outline explains unsupported, empty and oversized files and caps large trees", async () => {
  assert.match(
    (await documentOutline("image.bin", "abc")).message,
    /file type/,
  );
  assert.deepEqual(await entries("blank.html", ""), []);
  assert.match(
    (await documentOutline("huge.html", " ".repeat(2_000_001))).message,
    /2 MB/,
  );
  const result = await documentOutline("many.html", "<p>Hi</p>\n".repeat(510));
  assert.equal(result.entries.length, 500);
  assert.match(result.message, /first 500/);
  assert.equal(result.entries[499].line, 500);
  const mixed = await documentOutline(
    "many.php",
    "<main>\n<?php\n" +
      Array.from({ length: 505 }, (_, i) => `function f${i}() {}`).join("\n") +
      "\n?>\n</main>",
  );
  assert.equal(mixed.entries[0].label, "main");
  assert.equal(mixed.entries.length, 500);
});
