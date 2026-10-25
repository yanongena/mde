import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "@tiptap/pm/model";
import {
  markdownProjection,
  visualProjection,
  visualToSource,
  sourceToVisual,
} from "../src/lib/editor-position.ts";
import { visualMatches } from "../src/editors/visual-search.ts";
import { NavigationHistory } from "../src/lib/navigation.ts";
import { savedPosition } from "../electron/session.mjs";
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    heading: {
      content: "inline*",
      group: "block",
      attrs: { level: { default: 1 } },
    },
    codeBlock: { content: "text*", group: "block" },
    image: { inline: true, group: "inline", attrs: { alt: { default: "" } } },
    hardBreak: { inline: true, group: "inline" },
    text: { group: "inline" },
  },
  marks: { bold: {}, link: { attrs: { href: {} } } },
});
const node = (name, text, attrs) =>
  schema.node(name, attrs, text ? [schema.text(text)] : []);

test("editor projections preserve exact caret positions across Markdown markers and metadata", () => {
  const text =
    "\uFEFF---\r\ntitle: Demo\r\n---\r\n# Heading\r\n\r\nA **needle** and [link](other.md).\r\n\r\n```js\r\nconst code = 1;\r\n```\r\n";
  const doc = schema.node("doc", null, [
    node("heading", "Heading"),
    node("paragraph", "A needle and link."),
    node("codeBlock", "const code = 1;"),
  ]);
  const plain = visualProjection(doc);
  assert.equal(markdownProjection(text).text, plain.text);
  const target = plain.positions[plain.text.indexOf("needle") + 3];
  assert.equal(visualToSource(text, doc, target), text.indexOf("needle") + 3);
  assert.equal(sourceToVisual(text, doc, text.indexOf("needle") + 3), target);
  const end = plain.positions[plain.text.indexOf("needle") + "needle".length];
  assert.equal(
    visualToSource(text, doc, end, true),
    text.indexOf("needle") + "needle".length,
  );
  const code = plain.positions[plain.text.indexOf("code")];
  assert.equal(visualToSource(text, doc, code), text.indexOf("code"));
});
test("visual search matches across marks and supports whole words and code blocks", () => {
  const paragraph = schema.node("paragraph", null, [
    schema.text("nee"),
    schema.text("dle", [schema.mark("bold")]),
    schema.text(" needles"),
  ]);
  const doc = schema.node("doc", null, [
    paragraph,
    node("codeBlock", "NEEDLE"),
  ]);
  const matches = visualMatches(doc, { query: "needle", wholeWord: true });
  assert.equal(matches.length, 2);
  assert.equal(doc.textBetween(matches[0].from, matches[0].to), "needle");
  assert.equal(
    visualMatches(doc, { query: "needle", caseSensitive: true }).length,
    2,
  );
});
test("navigation retains source positions, branches after Back and follows renamed paths", () => {
  const history = new NavigationHistory();
  const location = (path, offset) => ({
    path,
    position: { sourceAnchor: offset, sourceHead: offset, scrollTop: offset },
  });
  history.record(undefined, location("a.md", 1));
  history.record(location("a.md", 9), location("b.md", 2));
  assert.equal(history.move(-1, location("b.md", 20)).position.sourceAnchor, 9);
  assert.equal(history.move(1).position.sourceAnchor, 20);
  history.move(-1);
  history.record(location("a.md", 9), location("c.md", 3));
  assert.deepEqual(
    history.entries.map((entry) => entry.path),
    ["a.md", "c.md"],
  );
  history.mapPaths((path) => (path === "c.md" ? "folder/c.md" : path));
  history.removePaths((path) => path === "a.md");
  assert.equal(history.entries[0].path, "folder/c.md");
  assert.equal(history.index, 0);
});
test("saved view state validates numeric bounds and discards malformed positions", () => {
  const value = {
    mode: "source",
    signature: "1:123",
    anchor: 1,
    head: 1,
    sourceAnchor: 1,
    sourceHead: 1,
    scrollTop: 20,
    topSource: 0,
    topOffset: -10,
    scrollRatio: 0.5,
  };
  assert.deepEqual(savedPosition(value), value);
  assert.equal(savedPosition({ ...value, head: NaN }), undefined);
  assert.equal(savedPosition({ ...value, mode: "script" }), undefined);
  assert.equal(savedPosition({ ...value, scrollRatio: 100 }).scrollRatio, 1);
});
