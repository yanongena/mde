import test from "node:test";
import assert from "node:assert/strict";
import { references, rewriteReferences } from "../electron/references.mjs";

test("destination-only rewrites preserve formatting, titles, anchors, encoding and CRLF", () => {
  const input =
    '# Heading\r\n\r\n[x](<notes/old name.md#intro> "Title")\r\n![pic](assets/image%20one.png)\r\n';
  const output = rewriteReferences(
    input,
    "index.md",
    "index.md",
    "notes/old name.md",
    "notes/new name.md",
  );
  assert.equal(
    output,
    '# Heading\r\n\r\n[x](<notes/new%20name.md#intro> "Title")\r\n![pic](assets/image%20one.png)\r\n',
  );
});
test("moving the source recalculates its links, including self-links and root paths", () => {
  const input =
    "[other](../b.md#part) ![a](./image.png) [self](a.md) [root](/notes/a.md) [web](https://example.com/a.md) [anchor](#hello)";
  const output = rewriteReferences(
    input,
    "notes/a.md",
    "archive/deep/a.md",
    "notes/a.md",
    "archive/deep/a.md",
  );
  assert.equal(
    output,
    "[other](../../b.md#part) ![a](../../notes/image.png) [self](a.md) [root](/archive/deep/a.md) [web](https://example.com/a.md) [anchor](#hello)",
  );
});
test("directory moves remap all descendants and respect path boundaries", () => {
  const input =
    "[one](notes/a.md) [two](notes/sub/b.md) [other](notes-other/a.md)";
  assert.equal(
    rewriteReferences(input, "index.md", "index.md", "notes", "knowledge"),
    "[one](knowledge/a.md) [two](knowledge/sub/b.md) [other](notes-other/a.md)",
  );
});
test("definitions are rewritten; code, external URLs and frontmatter stay literal", () => {
  const input =
    '---\nurl: [x](a.md)\n---\n\n[x][ref]\n\n[ref]: a.md "A title"\n\n`[literal](a.md)`\n\n```md\n[x](a.md)\n```\n[web](https://example.com/a.md)';
  assert.equal(
    rewriteReferences(input, "index.md", "index.md", "a.md", "b.md"),
    input.replace("[ref]: a.md", "[ref]: b.md"),
  );
});
test("balanced destination parentheses, image alt brackets and escaped paths", () => {
  const input =
    "[a *label*](folder/file(one).md) ![an [image]](folder/file%28one%29.png)";
  assert.equal(references(input, "index.md").length, 2);
  assert.equal(
    rewriteReferences(input, "index.md", "index.md", "folder", "new folder"),
    "[a *label*](new%20folder/file%28one%29.md) ![an [image]](new%20folder/file%28one%29.png)",
  );
});
test("relative path variants, Unicode, query strings and percent signs", () => {
  const input = "[x](./notes/caf%C3%A9%2520.md?view=1#heading)";
  assert.equal(
    rewriteReferences(input, "index.md", "index.md", "notes", "new"),
    "[x](./new/caf%C3%A9%2520.md?view=1#heading)",
  );
});
test("folder internal links stay valid when the entire folder moves", () => {
  const input = "[b](sub/b.md) ![](../assets/a.png)";
  assert.equal(
    rewriteReferences(
      input,
      "notes/a.md",
      "archive/notes/a.md",
      "notes",
      "archive/notes",
    ),
    "[b](sub/b.md) ![](../../assets/a.png)",
  );
});
