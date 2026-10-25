import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import { textMatches, type MatchOptions } from "../lib/text-search.ts";

export interface VisualSearchState extends MatchOptions {
  matches: { from: number; to: number }[];
  index: number;
}
export const visualSearchKey = new PluginKey<VisualSearchState>(
  "margin-search",
);
export function visualMatches(doc: Node, options: MatchOptions) {
  const matches: { from: number; to: number }[] = [];
  if (!options.query) return matches;
  doc.descendants((node, pos) => {
    if (!node.isTextblock || matches.length >= 2000) return;
    let text = "";
    const positions: number[] = [];
    node.descendants((child, offset) => {
      if (child.isText)
        for (let i = 0; i < (child.text?.length || 0); i++) {
          text += child.text![i];
          positions.push(pos + 1 + offset + i);
        }
      else if (child.isLeaf) {
        text += "\n";
        positions.push(pos + 1 + offset);
      }
    });
    for (const match of textMatches(text, options, 2000 - matches.length)) {
      matches.push({
        from: positions[match.from],
        to: positions[match.to - 1] + 1,
      });
    }
    return false;
  });
  return matches;
}
export const VisualSearch = Extension.create({
  name: "marginSearch",
  addProseMirrorPlugins() {
    return [
      new Plugin<VisualSearchState>({
        key: visualSearchKey,
        // Selection/search/view transactions must never add a trailing paragraph
        // to an otherwise untouched document ending in a code block or table.
        filterTransaction(transaction) {
          if (!transaction.docChanged)
            transaction.setMeta("skipTrailingNode", true);
          return true;
        },
        state: {
          init: () => ({ query: "", matches: [], index: 0 }),
          apply(transaction, previous) {
            const update = transaction.getMeta(visualSearchKey) as
              Partial<VisualSearchState> | undefined;
            if (!transaction.docChanged && !update) return previous;
            const next = { ...previous, ...update };
            next.matches = visualMatches(transaction.doc, next);
            next.index = Math.max(
              0,
              Math.min(next.index, next.matches.length - 1),
            );
            return next;
          },
        },
        props: {
          decorations(state) {
            const search = visualSearchKey.getState(state)!;
            return DecorationSet.create(
              state.doc,
              search.matches.map((match, index) =>
                Decoration.inline(match.from, match.to, {
                  class:
                    index === search.index
                      ? "document-search-hit document-search-active"
                      : "document-search-hit",
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});
