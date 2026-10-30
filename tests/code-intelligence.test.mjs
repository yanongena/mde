import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Workspace } from "../electron/workspace.mjs";
import { CodeIntelligence } from "../electron/code-intelligence.mjs";
import {
  cssSymbols,
  htmlSymbols,
  phpSymbols,
  phpCallAt,
  workspaceTarget,
} from "../electron/code-symbols.mjs";
import {
  resolvePhpFunction,
  lspCompletions,
} from "../src/lib/code-completions.ts";
import { phpBuiltins } from "../src/lib/php-builtins.ts";

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "margin-completion-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), text);
  }
  const workspace = new Workspace(root, { blocked: [] });
  return { root, workspace, index: new CodeIntelligence(workspace) };
}

test("CSS selectors, nested rules and escaped identifiers ignore comments and content", () => {
  const css = cssSymbols(
    '/* .fake {} */ .card:hover, .md\\:wide, #app {content:".other"} @media screen {.lesson {}} @import url("base.css");',
  );
  assert.deepEqual(css.classes, ["card", "md:wide", "lesson"]);
  assert.deepEqual(css.imports, ["base.css"]);
  assert.deepEqual(
    htmlSymbols(
      '<!-- <link rel="stylesheet" href="fake.css"> --><LINK REL="stylesheet" HREF="real.css"><div id="name">',
    ).stylesheets,
    ["real.css"],
  );
});

test("PHP signatures retain types, references, variadics, defaults and doc comments", () => {
  const source = `<?php namespace School; // function fake($x) {}\n/** Begroet een leerling. */\nfunction greet(string &$name, array $options = ['a', 'b'], ...$rest): ?string { $local = 1; return $name; } class Student { public function render(int $id): void {} }`;
  const result = phpSymbols(source, "functions.php");
  assert.deepEqual(
    result.functions.map((fn) => fn.fullName),
    ["School\\greet", "School\\Student::render"],
  );
  assert.equal(
    result.functions[0].signature,
    "greet(string &$name, array $options = ['a', 'b'], ...$rest): ?string",
  );
  assert.equal(result.functions[0].info, "Begroet een leerling.");
  assert.equal(result.functions[1].owner, "School\\Student");
});

test("PHP calls count only top-level commas and select the innermost call", () => {
  const code = "<?php greet(other(1, 2), ['a', 'b'], ";
  assert.equal(phpCallAt(code, code.length).active, 2);
  assert.equal(phpCallAt(code, code.indexOf("2)")).name, "other");
  assert.equal(phpCallAt("<?php greet('a,b", 15).active, 0);
  assert.equal(phpCallAt('<?php $x = "greet(1,2"', 20), null);
  assert.equal(phpCallAt("<?php greet(1);", 14), null);
});

test("namespaces, function aliases and global fallbacks resolve the correct signature", () => {
  const text =
    "<?php namespace School; use function Tools\\greet as hello; function greet($name) {} hello(";
  const local = phpSymbols(text),
    other = phpSymbols("<?php namespace Tools; function greet($name, $age) {}"),
    functions = [...local.functions, ...other.functions, ...phpBuiltins];
  assert.equal(
    resolvePhpFunction("hello", text.length, local, functions).parameters
      .length,
    2,
  );
  assert.equal(
    resolvePhpFunction("greet", text.length, local, functions).fullName,
    "School\\greet",
  );
  assert.equal(
    resolvePhpFunction("\\Tools\\greet", text.length, local, functions)
      .parameters.length,
    2,
  );
  assert.equal(
    resolvePhpFunction("strlen", text.length, local, functions).path,
    "PHP",
  );
});

test("project CSS follows linked sheets, recursive imports and unsaved buffers only", async (t) => {
  const { index } = await fixture(t, {
    "pages/index.html":
      '<link rel="stylesheet" href="../css/main.css?v=2"><div id="name">',
    "css/main.css": '@import "base.css"; .card {}',
    "css/base.css": '@import "main.css"; .base {}',
    "unused.css": ".unrelated {}",
  });
  let result = await index.project({ path: "pages/index.html", overlays: [] });
  assert.deepEqual(
    result.cssClasses.map((c) => c.name),
    ["card", "base"],
  );
  assert.deepEqual(result.ids, ["name"]);
  result = await index.project({
    path: "pages/index.html",
    overlays: [{ path: "css/main.css", text: ".unsaved {}" }],
  });
  assert.deepEqual(
    result.cssClasses.map((c) => c.name),
    ["unsaved"],
  );
  assert.equal(
    (
      await index.project({
        path: "pages/index.html",
        overlays: [{ path: "css/main.css", text: "" }],
      })
    ).cssClasses.length,
    0,
  );
});

test("PHP includes contribute HTML styles, project functions and unsaved signatures", async (t) => {
  const { index } = await fixture(t, {
    "index.php": '<?php require __DIR__ . "/header.php"; ?><div class="">',
    "header.php":
      '<link rel="stylesheet" href="style.css"><?php function greet($name) {}',
    "style.css": ".lesson {}",
    "functions.php":
      "<?php function calculate(int $a, int $b = 2): int {return $a + $b;}",
    "vendor/hidden.php": "<?php function hidden() {}",
  });
  const result = await index.project({
    path: "index.php",
    overlays: [
      {
        path: "functions.php",
        text: "<?php function calculate(float $value): float { return $value; }",
      },
    ],
  });
  assert.deepEqual(result.related, ["index.php", "header.php"]);
  assert.deepEqual(
    result.cssClasses.map((c) => c.name),
    ["lesson"],
  );
  assert.equal(
    result.functions.find((fn) => fn.name === "calculate").signature,
    "calculate(float $value): float",
  );
  assert.ok(!result.functions.some((fn) => fn.name === "hidden"));
});

test("mixed PHP strings and comments never become stylesheets or HTML IDs", () => {
  const php = phpSymbols(
    `<?php $fake = '<link rel="stylesheet" href="fake.css"><div id="fake">'; /* <style>.fake{}</style> */ ?><link rel="stylesheet" href="real.css">`,
  );
  const result = htmlSymbols(php.html);
  assert.deepEqual(result.stylesheets, ["real.css"]);
  assert.deepEqual(result.ids, []);
});

test("watcher invalidation refreshes changed, moved and deleted symbols", async (t) => {
  const { root, index } = await fixture(t, {
    "index.php": "<?php go(",
    "functions.php": "<?php function old() {}",
  });
  assert.ok(
    (await index.project({ path: "index.php", overlays: [] })).functions.some(
      (fn) => fn.name === "old",
    ),
  );
  await fs.writeFile(
    path.join(root, "functions.php"),
    "<?php function fresh($name) {}",
  );
  index.invalidate(["functions.php"]);
  assert.ok(
    (await index.project({ path: "index.php", overlays: [] })).functions.some(
      (fn) => fn.name === "fresh",
    ),
  );
  await fs.unlink(path.join(root, "functions.php"));
  index.invalidate(["functions.php"]);
  assert.equal(
    (await index.project({ path: "index.php", overlays: [] })).functions.length,
    0,
  );
});

test("code index rejects escaping overlays and skips symlinks and oversized files", async (t) => {
  const { root, index } = await fixture(t, {
    "index.php": "<?php",
    "huge.php": " ".repeat(1_000_001),
  });
  await assert.rejects(
    index.project({
      path: "index.php",
      overlays: [{ path: "../outside.php", text: "<?php" }],
    }),
    /outside|relative/,
  );
  if (process.platform !== "win32")
    await fs.symlink(path.join(root, "index.php"), path.join(root, "link.php"));
  const result = await index.project({ path: "index.php", overlays: [] });
  assert.equal(result.truncated, true);
  assert.ok(!result.paths.includes("link.php"));
  assert.equal(workspaceTarget("page.html", "../../outside.css"), null);
  assert.equal(
    workspaceTarget("page.html", "https://example.com/style.css"),
    null,
  );
  assert.equal(
    workspaceTarget("src/page.html", "../css/a%20b.css?v=1"),
    "css/a b.css",
  );
});

test("language-server completions apply method parentheses and imports atomically and reject stale edits", () => {
  const text = "<?php\n$x->beg";
  const [completion] = lspCompletions(
    {
      items: [
        {
          label: "begroet",
          kind: 2,
          insertText: "begroet",
          additionalTextEdits: [
            {
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 0 },
              },
              newText: "use School\\Leerling;\n",
            },
          ],
        },
      ],
    },
    text,
    false,
  );
  let dispatched;
  completion.apply(
    {
      state: { doc: { toString: () => text } },
      dispatch: (value) => (dispatched = value),
    },
    completion,
    10,
    13,
  );
  assert.equal(dispatched.userEvent, "input.complete");
  assert.equal(dispatched.changes[1].insert, "begroet()");
  assert.equal(
    dispatched.selection.anchor,
    10 + "begroet(".length + "use School\\Leerling;\n".length,
  );
  dispatched = undefined;
  completion.apply(
    {
      state: { doc: { toString: () => text + "x" } },
      dispatch: (value) => (dispatched = value),
    },
    completion,
    10,
    13,
  );
  assert.equal(dispatched, undefined);
});

test("qualified namespaces and braced namespaces keep function identities separate", () => {
  const text = "<?php namespace School\\Helpers; function greet($name) {}";
  assert.equal(
    phpSymbols(text).functions[0].fullName,
    "School\\Helpers\\greet",
  );
  const braced =
    "<?php namespace One { function greet($first) {} } namespace Two { function greet($second, $age) {} greet(";
  const local = phpSymbols(braced);
  assert.equal(
    resolvePhpFunction("greet", braced.length, local, local.functions)
      .parameters.length,
    2,
  );
});
