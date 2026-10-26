import test from "node:test";
import assert from "node:assert/strict";
import { unified } from "unified";
import remarkParse from "remark-parse";
import {
  dropWord,
  markdownFileHref,
  markdownFileLink,
  linkDropSpacing,
} from "../src/lib/markdown-file-drop.ts";
import { resolveLink } from "../src/lib/markdown.ts";

test("Markdown drop links resolve relative to the receiving document, including encoded filenames and self links", () => {
  for (const [document, file] of [
    ["notes/current.md", "notes/other.md"],
    ["notes/deep/current.md", "archive/Café [v2] #1 (draft).md"],
    ["index.md", "notes/O'Reilly!.markdown"],
    ["notes/self.md", "notes/self.md"],
  ]) {
    const href = markdownFileHref(document, file);
    assert.equal(resolveLink(document, href).path, file);
    assert.doesNotMatch(href, /[ #'()!\[\]]/);
  }
  assert.equal(
    markdownFileHref("notes/current.md", "notes/other.md"),
    "other.md",
  );
  assert.equal(markdownFileHref("notes/current.md", "other.md"), "../other.md");
});

test("Markdown drop labels retain special filename characters as literal link text", () => {
  const label = "[Draft] *ideas* & notes_1.md";
  const markdown = markdownFileLink(label, "../notes/draft.md");
  const link = unified().use(remarkParse).parse(markdown).children[0]
    .children[0];
  assert.equal(link.type, "link");
  assert.equal(link.url, "../notes/draft.md");
  assert.deepEqual(link.children, [
    { type: "text", value: label, position: link.children[0].position },
  ]);
});

test("word drop ranges preserve punctuation, Unicode and UTF-16 positions without consuming spaces", () => {
  const text = "Hi, café! 👋 wereld.";
  const cafe = dropWord(text, text.indexOf("café") + 2);
  assert.equal(text.slice(cafe.from, cafe.to), "café");
  const word = dropWord(text, text.indexOf("wereld") + 2);
  assert.equal(text.slice(word.from, word.to), "wereld");
  assert.equal(dropWord("   ", 1), null);
  assert.equal(dropWord("[link]", 2).from, 1);
  assert.equal(dropWord("één-twee", 5).to, 8);
});

test("blank-space drops separate the new link from neighboring words while respecting punctuation", () => {
  assert.deepEqual(linkDropSpacing("", ""), { before: "", after: "" });
  assert.deepEqual(linkDropSpacing(" ", " "), { before: "", after: "" });
  assert.deepEqual(linkDropSpacing("d", "w"), { before: " ", after: " " });
  assert.deepEqual(linkDropSpacing("(", ")"), { before: "", after: "" });
  assert.deepEqual(linkDropSpacing(".", ""), { before: " ", after: "" });
});
