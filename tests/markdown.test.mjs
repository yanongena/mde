import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { visualProtection } from "../src/lib/markdown.ts";
import { documentMode } from "../src/lib/document-mode.ts";
import { markdownPreviewHTML } from "../src/lib/markdown-preview.ts";

const php =
  "<?php\n$titel = 'ProjectHub';\necho $titel;\n?>\n\n<h1><?= $titel ?></h1>";

test("visual protection recognizes literal PHP/HTML in Markdown code examples", () => {
  for (const code of [
    "```php\n" + php + "\n```",
    "~~~php\n" + php + "\n~~~",
    php
      .split("\n")
      .map((line) => "    " + line)
      .join("\n"),
    "> ```php\n" +
      php
        .split("\n")
        .map((line) => "> " + line)
        .join("\n") +
      "\n> ```",
    "- ```php\n" +
      php
        .split("\n")
        .map((line) => "  " + line)
        .join("\n") +
      "\n  ```",
    "``<h1>`code`</h1>``",
    "````md\n```php\n" + php + "\n```\n````",
  ])
    assert.equal(visualProtection(code), null, code);
  assert.equal(
    visualProtection("```php\n" + php + "\n```\n\n<div>Real HTML</div>"),
    "embedded HTML",
  );
  assert.equal(
    visualProtection("`<h1>` <div>Real HTML</div>"),
    "embedded HTML",
  );
  assert.equal(
    visualProtection(
      "```php\n" + php + "\n``` trailing text\n\n<div>Still code</div>",
    ),
    null,
  );
});

test("angle-bracket destinations and autolinks are not embedded HTML", () => {
  assert.equal(
    visualProtection("[PDF](<Extra oefening_ Webshop zonder databank.pdf>)"),
    null,
  );
  assert.equal(
    visualProtection("<https://example.com> and <name@example.com>"),
    null,
  );
  assert.equal(
    visualProtection("[Lesson][L1]\n\n[L1]: <Extra oefening.docx>"),
    "reference definitions or footnotes",
  );
  assert.equal(
    visualProtection("Footnote[^1]\n\n[^1]: Detail"),
    "reference definitions or footnotes",
  );
  assert.equal(visualProtection("| A |\n| - |\n| One<br>Two |"), null);
  assert.equal(visualProtection("<!-- preserve -->"), "embedded HTML");
  assert.equal(visualProtection("[[wiki]]"), "wiki links");
});

test("protected Markdown supports explicit Visual without losing its Source default", () => {
  const text = "[Lesson][L1]\n\n[L1]: lesson.php";
  assert.equal(documentMode("note.md", text), "source");
  assert.equal(documentMode("note.md", text, "visual"), "visual");
  assert.equal(documentMode("note.md", "# Editable"), "visual");
  assert.equal(documentMode("note.php", php, "visual"), "source");
});

test("Markdown preview resolves reference links, renders literal PHP and retains heading source offsets", () => {
  const prefix = "\uFEFF---\r\ntitle: Private metadata\r\n---\r\n\r\n";
  const text =
    prefix +
    (
      "# Inventaris\n\n[Lesson][L1]\n\n[PDF](<Extra oefening.pdf>)\n\n```php\n" +
      php +
      "\n```\n\n## Repeat\n\n## Repeat\n\n![Image](../assets/image.png)\n\n[L1]: lesson.php\n"
    ).replace(/\n/g, "\r\n");
  const doc = new JSDOM(markdownPreviewHTML("notes/inventaris.md", text)).window
    .document;
  assert.equal(doc.querySelector("pre code").textContent, php + "\n");
  assert.equal(doc.querySelector('a[href="lesson.php"]').textContent, "Lesson");
  assert.equal(
    doc.querySelector('a[href="Extra%20oefening.pdf"]').textContent,
    "PDF",
  );
  assert.equal(
    doc.querySelector("img").src,
    "margin-asset://workspace/assets/image.png",
  );
  assert.equal(doc.querySelector("h1").id, "inventaris");
  assert.equal(
    Number(doc.querySelector("h1").dataset.sourceFrom),
    text.indexOf("# Inventaris"),
  );
  assert.deepEqual(
    [...doc.querySelectorAll("h2")].map((node) => node.id),
    ["repeat", "repeat-1"],
  );
  assert.doesNotMatch(doc.body.textContent, /Private metadata|\[L1\]:/);
});

test("Markdown preview removes executable HTML, dangerous links and unsafe images", () => {
  const html = markdownPreviewHTML(
    "notes/example.md",
    '<strong>Safe HTML</strong><script>window.__executed = true</script><img src="javascript:evil()" onerror="evil()">\n\n[Bad](javascript:evil)\n\n<iframe src="https://example.com"></iframe>',
  );
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector("strong").textContent, "Safe HTML");
  assert.equal(
    doc.querySelector(
      "script, iframe, [onerror], [href^='javascript:'], [src^='javascript:']",
    ),
    null,
  );
});
