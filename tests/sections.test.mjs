import test from "node:test";
import assert from "node:assert/strict";
import { unified } from "unified";
import remarkParse from "remark-parse";
import {
  markdownSections,
  headingSections,
  sectionLink,
} from "../src/lib/sections.ts";
import { resolveLink } from "../src/lib/markdown.ts";
import { documentOutline } from "../src/lib/outline.ts";

test("section titles use readable inline text, Unicode and full untruncated headings", async () => {
  const long = "Long " + "heading text ".repeat(25).trim();
  const text = `# **Bold** [linked](other.md) &amp; \`code\` ![Logo](x.png)\n\n## Café 世界 👋\n\n### ${long}\n`;
  const sections = markdownSections(text);
  assert.equal(sections[0].title, "Bold linked & code Logo");
  assert.equal(sections[1].title, "Café 世界 👋");
  assert.equal(sections[1].anchor, "café-世界-");
  assert.equal(sections[2].title, long);
  const outline = await documentOutline("notes/example.md", text);
  assert.equal(outline.entries[2].label.length, 160);
  assert.equal(outline.entries[2].section.title, long);
  assert.equal(outline.entries[0].section.anchor, sections[0].anchor);
});

test("section anchors distinguish duplicate, numbered, normalized and punctuation-only headings", () => {
  const text =
    "# Café\n\n## Cafe\u0301\n\n# Café-1\n\n# !!!\n\n# ???\n\n# Café\n";
  const sections = markdownSections(text);
  assert.deepEqual(
    sections.map((section) => section.anchor),
    ["café", "café-1", "café-1-1", "section", "section-1", "café-2"],
  );
  assert.deepEqual(
    headingSections(sections).map((section) => section.anchor),
    sections.map((section) => section.anchor),
  );
  const many = headingSections(
    Array.from({ length: 10_000 }, () => ({
      title: "Repeat",
      level: 2,
      from: 0,
      to: 1,
    })),
  );
  assert.equal(many.at(-1).anchor, "repeat-9999");
});

test("section parsing preserves BOM/CRLF/frontmatter offsets and excludes code examples", () => {
  const text =
    "\uFEFF---\r\nname: title\r\n# hidden metadata\r\n---\r\n\r\nSetext **title**\r\n==============\r\n\r\n```md\r\n# Fake\r\n```\r\n\r\n> ## Nested\r\n\r\n## Last ###\r\n";
  const sections = markdownSections(text);
  assert.deepEqual(
    sections.map((section) => section.title),
    ["Setext title", "Nested", "Last"],
  );
  assert.equal(sections[0].from, text.indexOf("Setext"));
  assert.equal(sections[1].from, text.indexOf("## Nested"));
  assert.equal(
    sections[2].to,
    text.indexOf("## Last ###") + "## Last ###".length,
  );
  assert.deepEqual(markdownSections("# " + "x".repeat(10 * 1024 * 1024)), []);
});

test("copied section Markdown escapes labels and resolves encoded workspace paths from another note", () => {
  const path = "notes/a # ? (é).md";
  const section = headingSections([
    {
      title:
        "[brackets] &copy; *stars* `code` <tag> " + String.fromCharCode(92),
      level: 2,
      from: 0,
      to: 10,
    },
  ])[0];
  const copied = sectionLink(path, section);
  const link = unified().use(remarkParse).parse(copied).children[0].children[0];
  assert.equal(link.type, "link");
  assert.equal(link.children.map((node) => node.value).join(""), section.title);
  assert.deepEqual(resolveLink("other/folder/note.md", link.url), {
    path,
    anchor: section.anchor,
  });
  assert.match(copied, /a%20%23%20%3F%20%28%C3%A9%29\.md#/);
});
