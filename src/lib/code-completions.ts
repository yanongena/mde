import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  keymap,
  showTooltip,
  type Tooltip,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { phpLanguage } from "@codemirror/lang-php";
import { htmlLanguage } from "@codemirror/lang-html";
import {
  acceptCompletion,
  autocompletion,
  clearSnippet,
  closeCompletion,
  completeFromList,
  moveCompletionSelection,
  nextSnippetField,
  prevSnippetField,
  selectedCompletion,
  snippetCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Settings } from "../types";
import type { CodeProject } from "../../electron/code-intelligence.mjs";
import {
  isPhp,
  isWebCode,
  phpSymbols,
  phpCallAt,
  type PhpFunction,
  type PhpSymbols,
} from "../../electron/code-symbols.mjs";
import { CodeProjectClient, completionMode } from "./code-project.ts";
import { phpBuiltins } from "./php-builtins.ts";

const emptyProject: CodeProject = {
  functions: [],
  classes: [],
  cssClasses: [],
  ids: [],
  paths: [],
  related: [],
  truncated: false,
};
const htmlDescriptions: Record<string, string> = {
  input:
    "Invoerveld. Met type kies je het soort invoer; name bepaalt de sleutel bij het versturen.",
  label:
    "Beschrijving van een invoerveld. Verbind for met het id van het veld.",
  form: "Formulier. action bepaalt de bestemming; method bepaalt hoe de gegevens verstuurd worden.",
  link: "Koppelt een externe bron, bijvoorbeeld CSS met rel=stylesheet en href.",
  img: "Afbeelding. src verwijst naar het bestand; alt beschrijft de inhoud.",
  a: "Link naar een pagina, bestand of anker via href.",
  div: "Algemene container voor inhoud en opmaak.",
  main: "De hoofdinhoud van de pagina.",
  class:
    "CSS-klassen voor dit element. Meerdere klassen scheid je met spaties.",
  id: "Unieke naam van een element, bruikbaar voor ankers, labels en CSS.",
  href: "Bestemming van een link of locatie van een gekoppelde bron.",
  src: "Locatie van een afbeelding, script of ander mediabestand.",
  alt: "Tekst die de inhoud of functie van een afbeelding beschrijft.",
  type: "Soort invoer, bijvoorbeeld text, email, password of number.",
  name: "Naam waaronder een formulier de waarde van dit veld verstuurt.",
  for: "Het id van het invoerveld dat bij dit label hoort.",
};
const keywords = [
  "echo",
  "return",
  "if",
  "else",
  "elseif",
  "foreach",
  "for",
  "while",
  "function",
  "class",
  "public",
  "private",
  "protected",
  "static",
  "new",
  "null",
  "true",
  "false",
  "include",
  "include_once",
  "require",
  "require_once",
  "namespace",
  "use",
  "try",
  "catch",
  "throw",
  "isset",
  "empty",
  "unset",
  "break",
  "continue",
];
const phpSnippets = [
  snippetCompletion("if (\u0024{condition}) {\n\t\u0024{}\n}", {
    label: "if",
    type: "keyword",
    detail: "voorwaarde · snippet",
  }),
  snippetCompletion(
    "foreach (\u0024{\u0024items} as \u0024{\u0024item}) {\n\t\u0024{}\n}",
    { label: "foreach", type: "keyword", detail: "herhaling · snippet" },
  ),
  snippetCompletion(
    "function \u0024{name}(\u0024{parameters}) {\n\t\u0024{}\n}",
    { label: "function", type: "keyword", detail: "functie · snippet" },
  ),
];
const htmlSnippets = [
  snippetCompletion(
    '<!doctype html>\n<html lang="nl">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${Titel}</title>\n</head>\n<body>\n\t${}\n</body>\n</html>',
    { label: "html:5", type: "text", detail: "HTML-basisdocument · snippet" },
  ),
  snippetCompletion('<link rel="stylesheet" href="${style.css}">', {
    label: "link:css",
    type: "text",
    detail: "stylesheet koppelen · snippet",
  }),
  snippetCompletion('<form action="${}" method="${post}">\n\t${}\n</form>', {
    label: "form:post",
    type: "text",
    detail: "formulier · snippet",
  }),
  snippetCompletion(
    '<label for="${name}">${Label}</label>\n<input type="${text}" id="${name}" name="${name}">',
    {
      label: "input:label",
      type: "text",
      detail: "label en invoerveld · snippet",
    },
  ),
];

export function resolvePhpFunction(
  name: string,
  pos: number,
  local: PhpSymbols,
  functions: PhpFunction[],
) {
  const namespace =
    local.namespaces.find((n) => pos >= n.from && pos <= n.to)?.name || "";
  const alias = local.imports.find(
    (i) =>
      i.namespace === namespace && i.name.toLowerCase() === name.toLowerCase(),
  );
  const target =
    alias?.target ||
    (name.startsWith("\\")
      ? name.slice(1)
      : [namespace, name].filter(Boolean).join("\\"));
  return (
    functions.find(
      (fn) => !fn.owner && fn.fullName.toLowerCase() === target.toLowerCase(),
    ) ||
    (!name.includes("\\") && !alias
      ? functions.find(
          (fn) => !fn.owner && fn.fullName.toLowerCase() === name.toLowerCase(),
        )
      : undefined)
  );
}
function functionCompletion(
  fn: PhpFunction,
  label: string,
  applyName: string,
  details: boolean,
  boost: number,
): Completion {
  return {
    label,
    type: "function",
    detail: fn.signature + (fn.path === "PHP" ? "" : " · " + fn.path),
    boost,
    ...(details ? { info: fn.info || fn.signature } : {}),
    apply(view, _completion, from, to) {
      const parens = /^\s*\(/.test(view.state.sliceDoc(to, to + 30))
        ? ""
        : "()";
      const insert = applyName + parens;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length - (parens ? 1 : 0) },
        userEvent: "input.complete",
      });
    },
  };
}

function attributeAt(context: CompletionContext) {
  let node = syntaxTree(context.state).resolveInner(context.pos, -1);
  for (; node; node = node.parent!) {
    if (node.name !== "Attribute") continue;
    const name = node.getChild("AttributeName"),
      value =
        node.getChild("AttributeValue") ||
        node.getChild("UnquotedAttributeValue");
    if (!name || !value || context.pos < value.from || context.pos > value.to)
      return null;
    const raw = context.state.sliceDoc(value.from, value.to),
      quoted = /^["']/.test(raw);
    const from = value.from + (quoted ? 1 : 0);
    if (context.pos < from) return null;
    return {
      name: context.state.sliceDoc(name.from, name.to).toLowerCase(),
      from,
      value: context.state.sliceDoc(from, context.pos),
      raw,
    };
  }
  return null;
}
function relativePath(from: string, target: string) {
  const parts = from.split("/").slice(0, -1),
    dest = target.split("/");
  while (parts.length && dest.length && parts[0] === dest[0]) {
    parts.shift();
    dest.shift();
  }
  return "../".repeat(parts.length) + dest.map(encodeURIComponent).join("/");
}
function pathOptions(
  path: string,
  value: string,
  project: CodeProject,
  kind: string,
): Completion[] {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return [];
  return project.paths
    .filter((name) => {
      if (kind === "src")
        return /\.(png|jpe?g|gif|svg|webp|avif|ico|js|mjs|mp[34]|webm|ogg|wav)$/i.test(
          name,
        );
      if (kind === "include") return isPhp(name);
      return true;
    })
    .map((name) => ({
      label: value.startsWith("/")
        ? "/" + name.split("/").map(encodeURIComponent).join("/")
        : relativePath(path, name),
      type: "text",
      detail: name,
    }));
}

interface LspPosition {
  line: number;
  character: number;
}
interface LspEdit {
  range: { start: LspPosition; end: LspPosition };
  newText: string;
}
interface LspItem {
  label: string;
  kind?: number;
  detail?: string;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: LspEdit;
  additionalTextEdits?: LspEdit[];
  documentation?: string | { value: string };
}
function offset(text: string, position: LspPosition) {
  if (
    !position ||
    !Number.isInteger(position.line) ||
    !Number.isInteger(position.character) ||
    position.line < 0 ||
    position.character < 0
  )
    return -1;
  const lines = text.split("\n");
  if (
    position.line >= lines.length ||
    position.character > lines[position.line].length
  )
    return -1;
  return (
    lines.slice(0, position.line).reduce((n, line) => n + line.length + 1, 0) +
    position.character
  );
}
export function lspCompletions(
  result: unknown,
  text: string,
  details: boolean,
): Completion[] {
  const items: LspItem[] = Array.isArray(result)
    ? result
    : (result as { items?: LspItem[] })?.items || [];
  return items
    .slice(0, 200)
    .filter(
      (item) => typeof item.label === "string" && item.insertTextFormat !== 2,
    )
    .map((item) => ({
      label: item.label,
      type:
        item.kind === 2
          ? "method"
          : item.kind === 3
            ? "function"
            : item.kind === 6
              ? "variable"
              : item.kind === 7
                ? "class"
                : "text",
      detail: item.detail,
      boost: 35,
      ...(details
        ? {
            info:
              typeof item.documentation === "string"
                ? item.documentation
                : item.documentation?.value,
          }
        : {}),
      apply(
        view: EditorView,
        _completion: Completion,
        from: number,
        to: number,
      ) {
        // Server edits refer to a specific UTF-16 document snapshot.
        if (view.state.doc.toString() !== text) return;
        const originalInsert =
          item.textEdit?.newText || item.insertText || item.label;
        const primaryFrom = item.textEdit
          ? offset(text, item.textEdit.range?.start)
          : from;
        const primaryTo = item.textEdit
          ? offset(text, item.textEdit.range?.end)
          : to;
        const parens =
          [2, 3].includes(item.kind || 0) &&
          /^[\p{L}\p{N}_\\]+$/u.test(originalInsert) &&
          !/^\s*\(/.test(text.slice(primaryTo, primaryTo + 30))
            ? "()"
            : "";
        const primary = {
          from: primaryFrom,
          to: primaryTo,
          insert: originalInsert + parens,
        };
        const changes = [
          primary,
          ...(item.additionalTextEdits || []).map((edit) => ({
            from: offset(text, edit.range?.start),
            to: offset(text, edit.range?.end),
            insert: edit.newText,
          })),
        ].sort((a, b) => a.from - b.from);
        if (
          changes.some(
            (c, i) =>
              c.from < 0 ||
              c.to < c.from ||
              c.to > text.length ||
              typeof c.insert !== "string" ||
              (i > 0 && changes[i - 1].to > c.from),
          )
        )
          return;
        const anchor =
          primary.from +
          primary.insert.length -
          (parens ? 1 : 0) +
          changes
            .filter((c) => c.to <= primary.from && c !== primary)
            .reduce((n, c) => n + c.insert.length - (c.to - c.from), 0);
        view.dispatch({
          changes,
          selection: EditorSelection.cursor(anchor),
          userEvent: "input.complete",
        });
      },
    }));
}

export const requestParameterHelp = StateEffect.define<null>();

interface Options {
  settings: Settings;
  active: boolean;
  project: CodeProjectClient;
}
export function codeAssistance(
  path: string,
  getOptions: () => Options,
): Extension {
  if (!isWebCode(path)) return [];
  let details = false;
  const queryProject = (text: string) =>
    getOptions()
      .project.project(path, text)
      .catch(() => emptyProject);
  const source = async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const { settings, project: client } = getOptions();
    if (completionMode(settings) === "off") return null;
    const text = context.state.doc.toString();
    if (text.length > 1_000_000) return null;
    if (isPhp(path) && phpLanguage.isActiveAt(context.state, context.pos, -1)) {
      const node = syntaxTree(context.state).resolveInner(context.pos, -1);
      let insideLiteral = false;
      for (let context = node; context; context = context.parent!)
        if (/Comment|String/.test(context.name)) insideLiteral = true;
      if (insideLiteral) {
        const include =
          /(?:include|require)(?:_once)?\s*(?:\(\s*)?(?:__DIR__\s*\.\s*)?['"]([^'"\n]*)$/i.exec(
            text.slice(Math.max(0, context.pos - 500), context.pos),
          );
        if (!include) return null;
        const project = await queryProject(text);
        return {
          from: context.pos - include[1].length,
          options: pathOptions(path, include[1], project, "include"),
        };
      }
      const word = context.matchBefore(/[\w$\\]+/);
      if (!word && !context.explicit) return null;
      const local = phpSymbols(text, path),
        project = await queryProject(text);
      if (context.aborted) return null;
      const from = word?.from ?? context.pos,
        value = word?.text || "";
      const namespace =
        local.namespaces.find(
          (n) => context.pos >= n.from && context.pos <= n.to,
        )?.name || "";
      let options: Completion[] = [];
      if (value.startsWith("$")) {
        const enclosing = local.functions
          .filter((fn) => context.pos >= fn.from && context.pos <= fn.to)
          .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
        const names = new Set(
          local.variables
            .filter(
              (v) =>
                v.from < from &&
                context.pos >= v.scopeFrom &&
                context.pos <= v.scopeTo &&
                (!enclosing || (v.local && v.scopeFrom === enclosing.from)),
            )
            .map((v) => v.name),
        );
        for (const name of [
          "$_GET",
          "$_POST",
          "$_SESSION",
          "$_SERVER",
          "$_FILES",
          "$_COOKIE",
          "$_REQUEST",
          "$_ENV",
        ])
          names.add(name);
        options = [...names].map((label) => ({
          label,
          type: "variable",
          boost: 25,
        }));
      } else if (
        !/(?:->|\?->|::)\s*$/.test(text.slice(Math.max(0, from - 80), from))
      ) {
        const functions = [
          ...local.functions,
          ...project.functions,
          ...phpBuiltins,
        ];
        const seen = new Set<string>();
        for (const fn of functions) {
          if (fn.owner || seen.has(fn.fullName.toLowerCase())) continue;
          seen.add(fn.fullName.toLowerCase());
          const alias = local.imports.find(
            (i) =>
              i.namespace === namespace &&
              i.target.toLowerCase() === fn.fullName.toLowerCase(),
          );
          const short = fn.namespace === namespace || !fn.namespace || !!alias;
          const label =
            alias?.name ||
            (value.includes("\\")
              ? (value.startsWith("\\") ? "\\" : "") + fn.fullName
              : fn.name);
          const applyName =
            alias?.name ||
            (short && !value.includes("\\") ? fn.name : "\\" + fn.fullName);
          options.push(
            functionCompletion(
              fn,
              label,
              applyName,
              details,
              fn.path === path
                ? 30
                : project.related.includes(fn.path)
                  ? 20
                  : fn.path === "PHP"
                    ? 0
                    : 10,
            ),
          );
        }
        options.push(
          ...keywords
            .filter((label) => !phpSnippets.some((s) => s.label === label))
            .map((label) => ({ label, type: "keyword" })),
          ...phpSnippets,
        );
        options.push(
          ...project.classes.map((entry) => ({
            label: entry.name,
            apply: entry.fullName.includes("\\")
              ? "\\" + entry.fullName
              : entry.name,
            type: "class",
            detail: entry.path,
          })),
        );
      }
      if (settings.phpLanguageServer === "phpactor") {
        const response = await window.margin
          .phpLanguageQuery({
            path,
            pos: context.pos,
            method: "completion",
            overlays: client.buffers(path, text),
          })
          .catch(() => null);
        if (context.aborted) return null;
        const server = lspCompletions(response?.result, text, details);
        // Prefer a server result when both providers describe the same symbol.
        options = [
          ...server,
          ...options.filter(
            (o) =>
              !server.some(
                (s) => s.label.toLowerCase() === o.label.toLowerCase(),
              ),
          ),
        ];
      }
      return { from, options };
    }
    const attr = htmlLanguage.isActiveAt(context.state, context.pos, -1)
      ? attributeAt(context)
      : null;
    if (attr) {
      if (
        ["class", "for", "href", "src", "action", "poster"].includes(attr.name)
      ) {
        const project = await queryProject(text);
        if (context.aborted) return null;
        if (attr.name === "class") {
          const token = /[^\s]*$/.exec(attr.value)![0],
            used = new Set(attr.raw.replace(/^["']|["']$/g, "").split(/\s+/));
          return {
            from: context.pos - token.length,
            options: project.cssClasses
              .filter((c) => !used.has(c.name) || c.name === token)
              .map((c) => ({
                label: c.name,
                type: "class",
                detail: c.path,
                boost: 20,
              })),
          };
        }
        if (
          attr.name === "for" ||
          (attr.name === "href" && attr.value.startsWith("#"))
        )
          return {
            from: attr.from + (attr.name === "href" ? 1 : 0),
            options: project.ids.map((label) => ({ label, type: "constant" })),
          };
        return {
          from: attr.from,
          options: pathOptions(
            path,
            attr.value,
            project,
            attr.name === "poster" ? "src" : attr.name,
          ),
        };
      }
    }
    const sources = context.state.languageDataAt<
      | ((
          c: CompletionContext,
        ) => CompletionResult | null | Promise<CompletionResult | null>)
      | readonly Completion[]
    >("autocomplete", context.pos);
    const results = await Promise.all(
      sources.map((s) =>
        typeof s === "function" ? s(context) : completeFromList(s)(context),
      ),
    );
    const result = results.find((r) => r && r.options.length);
    if (htmlLanguage.isActiveAt(context.state, context.pos, -1) && !attr) {
      const word = context.matchBefore(/[\w:!-]+/),
        node = syntaxTree(context.state).resolveInner(context.pos, -1);
      const snippets =
        ["Text", "Document"].includes(node.name) && (context.explicit || word)
          ? htmlSnippets
          : [];
      if (snippets.length)
        return result && result.from === (word?.from ?? context.pos)
          ? { ...result, options: [...result.options, ...snippets] }
          : { from: word?.from ?? context.pos, options: snippets };
    }
    if (
      result &&
      details &&
      htmlLanguage.isActiveAt(context.state, context.pos, -1)
    )
      return {
        ...result,
        options: result.options.map((option) => ({
          ...option,
          info:
            htmlDescriptions[option.label.replace(/^<\/?/, "")] || option.info,
        })),
      };
    return result || null;
  };

  const signatureEffect = StateEffect.define<Signature | null>();
  const signatureState = StateField.define<Signature | null>({
    create: () => null,
    update(value, tr) {
      if (tr.docChanged || tr.selection) value = null;
      for (const effect of tr.effects)
        if (effect.is(signatureEffect)) value = effect.value;
      return value;
    },
    provide: (field) =>
      showTooltip.from(field, (value): Tooltip | null =>
        value
          ? {
              pos: value.pos,
              above: true,
              strictSide: false,
              create() {
                const dom = document.createElement("div");
                dom.className = "cm-parameter-hint";
                dom.setAttribute("role", "status");
                dom.setAttribute("aria-label", "Function parameters");
                const code = document.createElement("div");
                const before = document.createTextNode(
                  value.label.slice(
                    0,
                    value.highlight?.[0] ?? value.label.length,
                  ),
                );
                code.append(before);
                if (value.highlight) {
                  const strong = document.createElement("strong");
                  strong.textContent = value.label.slice(...value.highlight);
                  code.append(
                    strong,
                    document.createTextNode(
                      value.label.slice(value.highlight[1]),
                    ),
                  );
                }
                dom.append(code);
                if (value.source) {
                  const source = document.createElement("small");
                  source.textContent = value.source;
                  dom.append(source);
                }
                return { dom };
              },
            }
          : null,
      ),
  });
  let plugin:
    { request(explicit?: boolean): void; dismiss(): boolean } | undefined;
  const signaturePlugin = ViewPlugin.fromClass(
    class {
      timer?: ReturnType<typeof setTimeout>;
      generation = 0;
      explicit = false;
      dismissedAt?: number;
      readonly view: EditorView;
      constructor(view: EditorView) {
        this.view = view;
        plugin = this;
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.dismissedAt = undefined;
        if (
          update.transactions.some((tr) =>
            tr.effects.some((effect) => effect.is(requestParameterHelp)),
          )
        )
          this.request(true);
        else if (update.docChanged || update.selectionSet) this.request();
      }
      request(explicit = false) {
        const { settings, active, project: client } = getOptions();
        if (explicit) {
          this.explicit = true;
          this.dismissedAt = undefined;
        }
        clearTimeout(this.timer);
        const generation = ++this.generation;
        if (
          !active ||
          !isPhp(path) ||
          !settings.parameterHints ||
          completionMode(settings) === "off" ||
          (settings.presentationMode && !this.explicit)
        )
          return;
        const text = this.view.state.doc.toString(),
          pos = this.view.state.selection.main.head;
        if (
          text.length > 1_000_000 ||
          !phpLanguage.isActiveAt(this.view.state, pos, -1)
        )
          return;
        const call = phpCallAt(text, pos);
        if (!call) {
          this.explicit = false;
          return;
        }
        if (this.dismissedAt === call.from) return;
        this.timer = setTimeout(
          async () => {
            const local = phpSymbols(text, path),
              project = await queryProject(text);
            const fn = resolvePhpFunction(call.name, pos, local, [
              ...local.functions,
              ...project.functions,
              ...phpBuiltins,
            ]);
            let signature: Signature | null = fn
              ? localSignature(fn, call.active, call.from)
              : null;
            if (settings.phpLanguageServer === "phpactor") {
              const response = await window.margin
                .phpLanguageQuery({
                  path,
                  pos,
                  method: "signatureHelp",
                  overlays: client.buffers(path, text),
                })
                .catch(() => null);
              signature =
                serverSignature(response?.result, call.from) || signature;
            }
            if (
              generation !== this.generation ||
              this.view.state.doc.toString() !== text ||
              this.view.state.selection.main.head !== pos ||
              !getOptions().active
            )
              return;
            this.view.dispatch({ effects: signatureEffect.of(signature) });
          },
          explicit ? 0 : 180,
        );
      }
      dismiss() {
        const had = !!this.view.state.field(signatureState);
        clearTimeout(this.timer);
        this.generation++;
        this.explicit = false;
        const text = this.view.state.doc.toString();
        this.dismissedAt =
          text.length <= 1_000_000
            ? phpCallAt(text, this.view.state.selection.main.head)?.from
            : undefined;
        if (had) this.view.dispatch({ effects: signatureEffect.of(null) });
        return had;
      }
      destroy() {
        clearTimeout(this.timer);
        this.generation++;
        plugin = undefined;
      }
    },
  );
  const start = (view: EditorView) => {
    details = false;
    return (
      completionMode(getOptions().settings) !== "off" && startCompletion(view)
    );
  };
  const presentation = getOptions().settings.presentationMode;
  return [
    autocompletion({
      override: [source],
      defaultKeymap: false,
      activateOnTyping: completionMode(getOptions().settings) === "automatic",
      activateOnTypingDelay: presentation ? 400 : 150,
      selectOnOpen: !presentation,
      tooltipClass: () =>
        "cm-project-completion" +
        (presentation ? " cm-teaching-completion" : ""),
      maxRenderedOptions: 60,
      interactionDelay: 0,
    }),
    signatureState,
    signaturePlugin,
    Prec.highest(
      keymap.of([
        { key: "Ctrl-Space", run: start },
        { mac: "Alt-i", run: start },
        {
          key: "Ctrl-Alt-Space",
          run: (view) => {
            details = true;
            closeCompletion(view);
            return (
              completionMode(getOptions().settings) !== "off" &&
              startCompletion(view)
            );
          },
        },
        {
          key: "Ctrl-Shift-Space",
          run: () => {
            plugin?.request(true);
            return true;
          },
        },
        {
          key: "Escape",
          run: (view) =>
            closeCompletion(view) ||
            clearSnippet(view) ||
            plugin?.dismiss() ||
            false,
        },
        { key: "ArrowDown", run: moveCompletionSelection(true) },
        { key: "ArrowUp", run: moveCompletionSelection(false) },
        { key: "PageDown", run: moveCompletionSelection(true, "page") },
        { key: "PageUp", run: moveCompletionSelection(false, "page") },
        {
          key: "Enter",
          run: (view) =>
            !getOptions().settings.presentationMode && acceptCompletion(view),
        },
        {
          key: "Tab",
          run: (view) =>
            nextSnippetField(view) ||
            (!!selectedCompletion(view.state) && acceptCompletion(view)),
          shift: prevSnippetField,
        },
      ]),
    ),
    EditorView.domEventHandlers({
      blur: () => {
        plugin?.dismiss();
        return false;
      },
    }),
  ];
}
interface Signature {
  pos: number;
  label: string;
  highlight?: [number, number];
  source?: string;
}
function localSignature(
  fn: PhpFunction,
  active: number,
  pos: number,
): Signature {
  const index = Math.min(active, fn.parameters.length - 1),
    parameter = fn.parameters[index];
  let start = fn.name.length + 1;
  for (let i = 0; i < index; i++) start += fn.parameters[i].label.length + 2;
  return {
    pos,
    label: fn.signature,
    highlight: parameter ? [start, start + parameter.label.length] : undefined,
    source: fn.path,
  };
}
function serverSignature(result: unknown, pos: number): Signature | null {
  const help = result as {
    activeSignature?: number;
    activeParameter?: number;
    signatures?: {
      label: string;
      activeParameter?: number;
      parameters?: { label: string | [number, number] }[];
    }[];
  } | null;
  const fn = help?.signatures?.[help.activeSignature || 0];
  if (!fn || typeof fn.label !== "string") return null;
  const label =
    fn.parameters?.[fn.activeParameter ?? help?.activeParameter ?? 0]?.label;
  const from =
    typeof label === "string"
      ? fn.label.indexOf(label, fn.label.indexOf("("))
      : -1;
  return {
    pos,
    label: fn.label,
    highlight: Array.isArray(label)
      ? label
      : from >= 0 && typeof label === "string"
        ? [from, from + label.length]
        : undefined,
    source: "Phpactor",
  };
}
