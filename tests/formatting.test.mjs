import test from "node:test";
import assert from "node:assert/strict";
import { formatCode, supportsFormatting } from "../src/lib/formatting.ts";

const format = (path, text, indentSize = 2) =>
  formatCode({ path, text, indentSize, cursorOffset: 0 });
test("HTML includes nested indentation and embedded CSS/JavaScript formatting", async () => {
  const input =
    '<!doctype html><html lang="nl"><head><style>body{margin:0;color:#333}h1{font-size:2rem}</style></head><body><h1>Titel</h1><p>Hallo <span>wereld</span>!</p><script>function hello(){return {ok:true};}</script></body></html>';
  const { formatted } = await format("page.HTML", input);
  assert.match(formatted, /\n  <head>/);
  assert.match(formatted, /\n    <style>/);
  assert.match(formatted, /\n      body \{/);
  assert.match(formatted, /\n        margin: 0;/);
  assert.match(formatted, /<p>Hallo <span>wereld<\/span>!<\/p>/);
  assert.match(formatted, /function hello\(\) \{/);
  assert.equal((await format("page.html", formatted)).formatted, formatted);
});
test("formatters respect indentation, CRLF and cursor position", async () => {
  const input = '{"items":[1,2],"nested":{"enabled":true}}\r\n';
  const result = await format("settings.json", input, 4);
  assert.match(result.formatted, /\r\n    "items"/);
  assert.match(result.formatted, /\r\n        "enabled"/);
  assert.equal(result.cursorOffset, 0);
  assert.equal(
    JSON.stringify(JSON.parse(input)),
    JSON.stringify(JSON.parse(result.formatted)),
  );
  assert.equal(result.formatted.replace(/\r\n/g, "").includes("\n"), false);
});
test("JavaScript, TypeScript, CSS, YAML, XML and pure PHP use real parsers", async () => {
  const samples = [
    ["main.js", "function a(){return {one:1,two:2}}"],
    ["main.ts", "const object:{one:number}={one:1}"],
    ["main.css", "body{margin:0;padding:10px;color:red}"],
    ["main.yaml", "hello: {one: 1,two: 2}"],
    ["main.xml", "<root><nested><value>hello</value></nested></root>"],
    ["main.php", '<?php function greet($name){return "Hello ".$name;}'],
  ];
  for (const [path, input] of samples) {
    assert.equal(supportsFormatting(path), true);
    const { formatted } = await format(path, input);
    assert.notEqual(formatted, input, path);
    assert.equal((await format(path, formatted)).formatted, formatted, path);
  }
});
test("invalid, unsupported and mixed PHP/HTML are refused instead of guessed", async () => {
  await assert.rejects(format("broken.json", '{"broken": }'));
  await assert.rejects(
    format("script.py", 'if True:\nprint("hello")'),
    /No formatter/,
  );
  await assert.rejects(
    format("page.php", "<?php echo 1; ?><p>Hello</p>"),
    /Mixed PHP/,
  );
  assert.equal(supportsFormatting("notes.md"), false);
  assert.equal(supportsFormatting("script.py"), false);
});
