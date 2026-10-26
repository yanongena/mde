import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import {
  spellingWords,
  Spellcheck,
  spellcheckKey,
} from "../src/editors/spellcheck.ts";
import {
  spellcheckLanguage,
  createSpellcheck,
} from "../electron/spellcheck.mjs";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    codeBlock: { content: "text*", group: "block" },
    hardBreak: { inline: true, group: "inline" },
    text: { group: "inline" },
  },
  marks: { bold: {}, code: {} },
});

test("spelling checks complete words across formatting, skips code and retains exact offsets", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("een café e\u0301én "),
      schema.text("fiet", [schema.mark("bold")]),
      schema.text("sen "),
      schema.text("skipMe", [schema.mark("code")]),
      schema.node("hardBreak"),
      schema.text("een H4 123 radio’s"),
    ]),
    schema.node("codeBlock", null, [schema.text("skipBlock")]),
  ]);
  const words = spellingWords(doc, "nl");
  assert.deepEqual(
    words.map((part) => part.word),
    ["een", "café", "één", "fietsen", "een", "radio’s"],
  );
  for (const part of words)
    assert.equal(
      doc.textBetween(part.from, part.to).normalize("NFC"),
      part.word,
    );
});

test("system language resolves regional Dutch and invalid preferences are rejected", () => {
  assert.equal(spellcheckLanguage("system", "nl-BE", ["en-US", "nl"]), "nl");
  assert.equal(
    spellcheckLanguage("system", "en-GB", ["en-US", "en-GB"]),
    "en-GB",
  );
  assert.equal(spellcheckLanguage("system", "xx", ["nl", "en-US"]), "en-US");
  assert.throws(() => spellcheckLanguage("xx", "nl", ["nl"]), /Unsupported/);
});

test("local dictionaries give consistent verdicts, invalidate old requests and turn off", async (t) => {
  const updates = [];
  const check = createSpellcheck("nl-BE", (info) => updates.push(info));
  t.after(() => check.dispose());
  const loading = check.configure({
    spellcheckEnabled: true,
    spellcheckLanguage: "system",
  });
  assert.equal(check.info().status, "loading");
  assert.deepEqual(await check.check(["een"], check.info().revision), {
    ready: false,
    misspelled: [],
  });
  await loading;
  assert.equal(check.info().language, "nl");
  assert.equal(check.info().status, "ready");
  const revision = check.info().revision;
  const words = ["een", "verschillende", "qzxqzxqzx", "een", "qzxqzxqzx"];
  assert.deepEqual(await check.check(words, revision), {
    ready: true,
    misspelled: ["qzxqzxqzx", "qzxqzxqzx"],
  });
  await check.configure({
    spellcheckEnabled: true,
    spellcheckLanguage: "system",
  });
  assert.equal(check.info().revision, revision);
  await check.configure({ spellcheckEnabled: false, spellcheckLanguage: "nl" });
  assert.equal(check.info().enabled, false);
  assert.equal(check.info().language, "nl");
  assert.deepEqual(await check.check(words, check.info().revision), {
    ready: true,
    misspelled: [],
  });
  await check.configure({
    spellcheckEnabled: true,
    spellcheckLanguage: "en-US",
  });
  assert.deepEqual(await check.check(words, revision), {
    ready: false,
    misspelled: [],
  });
  assert.ok(
    (await check.check(words, check.info().revision)).misspelled.includes(
      "verschillende",
    ),
  );
  assert.ok(updates.at(-1).revision > revision);
  await assert.rejects(
    () => check.check(["x".repeat(129)], check.info().revision),
    /Invalid spelling/,
  );
});

test("late dictionary loads cannot override a newer language or disabled spelling", async () => {
  let complete;
  const check = createSpellcheck(
    "nl",
    () => {},
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const first = check.configure({
    spellcheckEnabled: true,
    spellcheckLanguage: "nl",
  });
  await check.configure({
    spellcheckEnabled: false,
    spellcheckLanguage: "en-US",
  });
  complete({ check: async (words) => words });
  await first;
  assert.equal(check.info().enabled, false);
  assert.equal(check.info().language, "en-US");
  assert.deepEqual(await check.check(["qzx"], check.info().revision), {
    ready: true,
    misspelled: [],
  });
  const broken = createSpellcheck(
    "nl",
    () => {},
    () => Promise.reject(new Error("missing dictionary")),
  );
  await broken.configure({ spellcheckEnabled: true, spellcheckLanguage: "nl" });
  assert.equal(broken.info().status, "error");
});

test("all bundled languages load locally and retain their spelling differences", async (t) => {
  const check = createSpellcheck("en-US", () => {});
  t.after(() => check.dispose());
  for (const [language, word] of [
    ["nl", "fiets"],
    ["en-US", "color"],
    ["en-GB", "colour"],
    ["fr", "bonjour"],
    ["de", "Straße"],
  ]) {
    await check.configure({
      spellcheckEnabled: true,
      spellcheckLanguage: language,
    });
    assert.equal(check.info().status, "ready", language);
    assert.deepEqual(
      await check.check([word, "qzxqzxqzx"], check.info().revision),
      {
        ready: true,
        misspelled: ["qzxqzxqzx"],
      },
      language,
    );
  }
});

test("an in-flight spelling result cannot restore markers after editing or disabling", async () => {
  const previousWindow = globalThis.window;
  let complete, started;
  let info = { enabled: true, status: "ready", language: "nl", revision: 1 };
  let calls = 0;
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  globalThis.window = {
    margin: {
      checkSpelling: async () => {
        calls++;
        if (calls === 1) {
          started();
          await new Promise((resolve) => {
            complete = resolve;
          });
        }
        return { ready: true, misspelled: ["qzxqzxqzx"] };
      },
    },
  };
  const extension = Spellcheck.configure({
    info: () => info,
    visible: () => true,
    onError: (message) => {
      throw new Error(message);
    },
  });
  const [plugin] = extension.config.addProseMirrorPlugins.call(extension);
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("qzxqzxqzx")]),
  ]);
  const view = {
    state: EditorState.create({ schema, doc, plugins: [plugin] }),
    dom: new EventTarget(),
    composing: false,
    dispatch(tr) {
      const previous = this.state;
      this.state = this.state.apply(tr);
      lifecycle.update(this, previous);
    },
  };
  const lifecycle = plugin.spec.view(view);
  try {
    await requested;
    view.dispatch(view.state.tr.insertText("een", 1, 10));
    info = { ...info, enabled: false, revision: 2 };
    view.dispatch(view.state.tr.setMeta(spellcheckKey, "refresh"));
    complete();
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(view.state.doc.textContent, "een");
    assert.deepEqual(spellcheckKey.getState(view.state).decorations.find(), []);
    assert.equal(calls, 1);
  } finally {
    lifecycle.destroy();
    globalThis.window = previousWindow;
  }
});
