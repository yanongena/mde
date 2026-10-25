import test from "node:test";
import assert from "node:assert/strict";
import { terminalLinkAt } from "../src/lib/terminal-links.ts";

function terminal(cols, lines) {
  return {
    cols,
    buffer: {
      active: {
        getLine(y) {
          const line = lines[y];
          if (!line) return undefined;
          const cells = [];
          for (const char of line.text) {
            const width = ["界", "😀"].includes(char) ? 2 : 1;
            cells.push({ getChars: () => char, getWidth: () => width });
            if (width === 2)
              cells.push({ getChars: () => "", getWidth: () => 0 });
          }
          while (cells.length < cols)
            cells.push({ getChars: () => "", getWidth: () => 1 });
          return { isWrapped: !!line.wrapped, getCell: (x) => cells[x] };
        },
      },
    },
  };
}

test("terminal URL hit testing distinguishes neighboring links and strips sentence punctuation", () => {
  const term = terminal(60, [
    { text: "see https://one.test/a, and https://two.test/b." },
  ]);
  assert.equal(terminalLinkAt(term, 0, 8), "https://one.test/a");
  assert.equal(terminalLinkAt(term, 0, 35), "https://two.test/b");
  assert.equal(terminalLinkAt(term, 0, 0), null);
  assert.equal(terminalLinkAt(term, 0, 60), null);
});

test("terminal URL hit testing maps wide cells and surrogate characters before a wrapped URL", () => {
  const term = terminal(21, [
    { text: "界😀 https://example." },
    { text: "test/long-path", wrapped: true },
  ]);
  assert.equal(terminalLinkAt(term, 0, 6), "https://example.test/long-path");
  assert.equal(terminalLinkAt(term, 1, 5), "https://example.test/long-path");
  assert.equal(terminalLinkAt(term, 0, 3), null);
  assert.equal(terminalLinkAt(term, 1, 19), null);
});

test("terminal URL hit testing joins only soft-wrapped lines and refuses partial scrollback URLs", () => {
  const term = terminal(20, [
    { text: "https://example.test" },
    { text: "/not-a-continuation" },
  ]);
  assert.equal(terminalLinkAt(term, 0, 2), "https://example.test");
  assert.equal(terminalLinkAt(term, 1, 4), null);
  const partial = terminal(20, [
    { text: "https://partial.test", wrapped: true },
  ]);
  assert.equal(terminalLinkAt(partial, 0, 10), null);
});
