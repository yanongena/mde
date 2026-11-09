import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { htmlPreviewDocument } from "../src/lib/html-preview.ts";
import {
  refreshPreviewAssets,
  updatePreviewDocument,
} from "../src/lib/html-preview-update.ts";

globalThis.DOMParser = new JSDOM().window.DOMParser;

test("preview updates CSS and markup while retaining the document, images and form state", () => {
  const source =
    '<link rel="stylesheet" href="style.css"><h1>Before</h1><input id="name"><img src="photo.png">';
  const before = htmlPreviewDocument("lesson/index.html", source, [
    { path: "lesson/style.css", text: "h1 { color: red; }" },
  ]);
  const document = new JSDOM(before).window.document;
  const body = document.body;
  const image = document.querySelector("img");
  const input = document.querySelector("input");
  input.value = "Keep my input";
  input.focus();
  input.setSelectionRange(2, 5);
  document.body.dataset.retained = "yes";
  const after = htmlPreviewDocument("lesson/index.html", source, [
    { path: "lesson/style.css", text: "h1 { color: blue; }" },
  ]);
  updatePreviewDocument(document, before, after);
  assert.equal(
    document.querySelector("style").textContent,
    "h1 { color: blue; }",
  );
  const next = htmlPreviewDocument(
    "lesson/index.html",
    source
      .replace("Before", "After")
      .replace("<input", "<p>Inserted</p><input"),
    [{ path: "lesson/style.css", text: "h1 { color: blue; }" }],
  );
  updatePreviewDocument(document, after, next);
  assert.equal(document.body, body);
  assert.equal(document.body.dataset.retained, "yes");
  assert.equal(document.querySelector("h1").textContent, "After");
  assert.equal(document.querySelector("img"), image);
  assert.equal(document.querySelector("input"), input);
  assert.equal(input.value, "Keep my input");
  assert.equal(document.activeElement, input);
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 5);
});

test("preview updates attributes, namespaces, removed nodes and malformed SVG without losing its policy", () => {
  const before = htmlPreviewDocument(
    "drawing.svg",
    '<svg xmlns="http://www.w3.org/2000/svg"><circle id="dot" fill="red"/><text>Old</text></svg>',
  );
  const document = new JSDOM(before).window.document;
  const circle = document.querySelector("circle");
  const after = htmlPreviewDocument(
    "drawing.svg",
    '<svg xmlns="http://www.w3.org/2000/svg"><circle id="dot" r="8"/></svg>',
  );
  updatePreviewDocument(document, before, after);
  assert.equal(document.querySelector("circle"), circle);
  assert.equal(circle.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(circle.hasAttribute("fill"), false);
  assert.equal(circle.getAttribute("r"), "8");
  assert.equal(document.querySelector("text"), null);
  const invalid = htmlPreviewDocument("drawing.svg", "<svg><circle></svg>");
  updatePreviewDocument(document, after, invalid);
  assert.equal(document.querySelector("svg"), null);
  assert.match(
    document.querySelector('[role="alert"]').textContent,
    /Correct the SVG/,
  );
  assert.match(
    document.querySelector('meta[http-equiv="Content-Security-Policy"]')
      .content,
    /script-src 'none'/,
  );
  assert.equal(
    document.querySelector("base").href,
    "margin-asset://workspace/",
  );
});

test("asset refresh retains old styles until load, respects cascade order and cancels pending replacements", () => {
  const document = new JSDOM(
    htmlPreviewDocument(
      "index.html",
      '<link rel="stylesheet" href="style.css" media="screen"><style>h1 { color: green; }</style>',
    ),
  ).window.document;
  const original = document.querySelector("link");
  const override = document.querySelector("style");
  const cancel = refreshPreviewAssets(document);
  const replacement = original.nextSibling;
  assert.equal(original.isConnected, true);
  assert.equal(replacement.getAttribute("media"), "screen");
  replacement.dispatchEvent(new document.defaultView.Event("load"));
  assert.equal(original.isConnected, false);
  assert.equal(replacement.nextSibling, override);
  cancel();
  assert.equal(replacement.isConnected, true);
  const cancelPending = refreshPreviewAssets(document);
  assert.equal(document.querySelectorAll("link").length, 2);
  cancelPending();
  assert.deepEqual([...document.querySelectorAll("link")], [replacement]);
});
