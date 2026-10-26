import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { SpellcheckInfo } from "../types";

export const spellcheckKey = new PluginKey<{
  decorations: DecorationSet;
  version: number;
}>("margin-spellcheck");

// Assemble complete text blocks so formatting in the middle of a word does not
// change its spelling. Positions still address the original ProseMirror text.
export function spellingWords(doc: Node, language: string) {
  const words: { word: string; from: number; to: number }[] = [];
  const segmenter = new Intl.Segmenter(language || "en", {
    granularity: "word",
  });
  doc.descendants((block, pos) => {
    if (block.type.name === "codeBlock") return false;
    if (!block.isTextblock) return;
    let text = "";
    const positions: number[] = [];
    block.descendants((node, offset) => {
      const skip = node.marks.some((mark) => mark.type.name === "code");
      if (node.isText) {
        for (let i = 0; i < node.text!.length; i++) {
          text += skip ? "\0" : node.text![i];
          positions.push(pos + 1 + offset + i);
        }
      } else if (node.isLeaf) {
        text += "\0";
        positions.push(pos + 1 + offset);
      }
    });
    for (const part of segmenter.segment(text)) {
      if (
        !part.isWordLike ||
        part.segment.length > 128 ||
        !/\p{L}/u.test(part.segment) ||
        /\p{N}/u.test(part.segment)
      )
        continue;
      words.push({
        word: part.segment.normalize("NFC"),
        from: positions[part.index],
        to: positions[part.index + part.segment.length - 1] + 1,
      });
    }
    return false;
  });
  return words;
}

export const Spellcheck = Extension.create<{
  info: () => SpellcheckInfo | null;
  visible: () => boolean;
  onError: (message: string) => void;
}>({
  name: "marginSpellcheck",
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<{ decorations: DecorationSet; version: number }>({
        key: spellcheckKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty, version: 0 }),
          apply(tr, previous) {
            const result = tr.getMeta(spellcheckKey);
            if (result instanceof DecorationSet)
              return { ...previous, decorations: result };
            // Drop obsolete results immediately; checking never changes the document.
            if (tr.docChanged || result === "refresh")
              return {
                decorations: DecorationSet.empty,
                version: previous.version + 1,
              };
            return previous;
          },
        },
        props: {
          decorations: (state) => spellcheckKey.getState(state)?.decorations,
        },
        view(view) {
          let timer: ReturnType<typeof setTimeout>;
          let generation = 0;
          let destroyed = false;
          let retries = 0;
          const schedule = (delay = 180) => {
            clearTimeout(timer);
            const run = ++generation;
            timer = setTimeout(
              () =>
                void check(run).catch((error) => {
                  if (current(run)) options.onError((error as Error).message);
                }),
              delay,
            );
          };
          const current = (run: number) => !destroyed && run === generation;
          const check = async (run: number) => {
            const info = options.info();
            if (
              !current(run) ||
              !options.visible() ||
              !info?.enabled ||
              info.status !== "ready"
            )
              return;
            if (view.composing) {
              schedule();
              return;
            }
            const doc = view.state.doc;
            const words = spellingWords(doc, info.language);
            const unique = [...new Set(words.map(({ word }) => word))];
            const misspelled = new Set<string>();
            for (let start = 0; start < unique.length; start += 250) {
              if (!current(run)) return;
              const result = await window.margin.checkSpelling(
                unique.slice(start, start + 250),
                info.revision,
              );
              if (!current(run)) return;
              if (!result.ready) {
                // A language switch may overtake an in-flight IPC request.
                if (retries++ < 60) schedule(500);
                return;
              }
              result.misspelled.forEach((word) => misspelled.add(word));
              if (start + 250 < unique.length)
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            if (!current(run) || view.state.doc !== doc) return;
            retries = 0;
            view.dispatch(
              view.state.tr
                .setMeta(
                  spellcheckKey,
                  DecorationSet.create(
                    doc,
                    words
                      .filter(({ word }) => misspelled.has(word))
                      .map(({ from, to }) =>
                        Decoration.inline(from, to, {
                          class: "spelling-error",
                        }),
                      ),
                  ),
                )
                .setMeta("addToHistory", false),
            );
          };
          const focus = () => {
            retries = 0;
            schedule();
          };
          view.dom.addEventListener("focus", focus);
          schedule();
          return {
            update(updated, previous) {
              if (
                spellcheckKey.getState(updated.state)?.version !==
                spellcheckKey.getState(previous)?.version
              ) {
                retries = 0;
                schedule();
              }
            },
            destroy() {
              destroyed = true;
              generation++;
              clearTimeout(timer);
              view.dom.removeEventListener("focus", focus);
            },
          };
        },
      }),
    ];
  },
});
