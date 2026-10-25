import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
export interface SlashState {
  from: number;
  to: number;
  query: string;
  dismissed: boolean;
}
export const slashKey = new PluginKey<SlashState | null>("margin-slash");
export const slashHandlers = new WeakMap<
  EditorView,
  (event: KeyboardEvent) => boolean
>();
export const SlashMenuExtension = Extension.create({
  name: "marginSlash",
  addProseMirrorPlugins() {
    return [
      new Plugin<SlashState | null>({
        key: slashKey,
        state: {
          init: () => null,
          apply(transaction, previous) {
            const { selection } = transaction,
              node = selection.$from.parent;
            if (
              !selection.empty ||
              !["paragraph", "heading"].includes(node.type.name)
            )
              return null;
            const before = node.textBetween(
                0,
                selection.$from.parentOffset,
                "",
                "\ufffc",
              ),
              match = before.match(/^\/([\p{L}\p{N} -]{0,40})$/u);
            if (!match) return null;
            const from = selection.$from.start();
            return {
              from,
              to: selection.from,
              query: match[1],
              dismissed:
                !!transaction.getMeta(slashKey)?.dismiss ||
                (!!previous?.dismissed && previous.from === from),
            };
          },
        },
        props: {
          handleKeyDown(view, event) {
            const state = slashKey.getState(view.state);
            return state && !state.dismissed
              ? slashHandlers.get(view)?.(event) || false
              : false;
          },
        },
      }),
    ];
  },
});
