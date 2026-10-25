import { languages } from "@codemirror/language-data";
import type { SyntaxNode, Tree } from "@lezer/common";
import { markdownSections, type Section } from "./sections.ts";

export interface OutlineEntry {
  label: string;
  kind: string;
  from: number;
  to: number;
  line: number;
  depth: number;
  headingIndex?: number;
  section?: Section;
}
export interface OutlineResult {
  entries: OutlineEntry[];
  message?: string;
}
type Candidate = Omit<OutlineEntry, "line" | "depth"> & { depth?: number };
const extensions = new Set([
  "md",
  "markdown",
  "mdown",
  "html",
  "htm",
  "php",
  "phtml",
  "php3",
  "php4",
  "php5",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
  "css",
  "scss",
  "less",
  "xml",
  "xsd",
  "xsl",
  "xslt",
  "svg",
  "vue",
  "py",
  "pyw",
]);
const MAX_ENTRIES = 500;
const compact = (value: string) =>
  value.replace(/\s+/g, " ").trim().slice(0, 160);
const source = (text: string, node: SyntaxNode | null) =>
  node ? text.slice(node.from, node.to) : "";
const child = (node: SyntaxNode, names: string[]) => {
  for (let current = node.firstChild; current; current = current.nextSibling)
    if (names.includes(current.name)) return current;
  return null;
};

const declarations: Record<string, [string, string[]]> = {
  ClassDeclaration: ["class", ["VariableDefinition", "Name"]],
  ClassDefinition: ["class", ["VariableName"]],
  InterfaceDeclaration: ["interface", ["TypeDefinition", "Name"]],
  TraitDeclaration: ["trait", ["Name"]],
  EnumDeclaration: ["enum", ["TypeDefinition", "Name"]],
  TypeAliasDeclaration: ["type", ["TypeDefinition"]],
  NamespaceDefinition: ["namespace", ["QualifiedName", "Name"]],
  FunctionDeclaration: ["fn", ["VariableDefinition"]],
  FunctionDefinition: ["fn", ["Name", "VariableName"]],
  MethodDeclaration: [
    "method",
    ["PropertyDefinition", "Name", "PrivatePropertyDefinition"],
  ],
  MethodType: ["method", ["PropertyDefinition"]],
};

async function parse(extension: string, text: string): Promise<Tree> {
  const alias: Record<string, string> = {
    markdown: "md",
    mdown: "md",
    phtml: "php",
    php3: "php",
    php4: "php",
    php5: "php",
    mts: "ts",
    cts: "ts",
    xsd: "xml",
    xsl: "xml",
    xslt: "xml",
    svg: "xml",
  };
  const name = alias[extension] || extension;
  const description = languages.find((language) =>
    language.extensions.includes(name),
  );
  if (!description) throw new Error("No outline parser available.");
  return (await description.load()).language.parser.parse(text);
}

// Parse structure, rather than matching lines: comments, strings and fenced
// examples must not become symbols. Mixed HTML parsers also expose JS/CSS trees.
function collect(tree: Tree, text: string, found: Candidate[]) {
  tree.iterate({
    enter(ref) {
      if (found.length > MAX_ENTRIES) return false;
      const node = ref.node;
      const add = (
        label: string,
        kind: string,
        range: { from: number; to: number } = node,
      ) => {
        if (label)
          found.push({
            label: compact(label),
            kind,
            from: range.from,
            to: range.to,
          });
      };
      if (node.name === "Element") {
        const tag = child(node, ["OpenTag", "SelfClosingTag"]);
        const name = tag?.getChild("TagName");
        if (!tag || !name) return;
        const tagName = source(text, name);
        let label = tagName;
        for (const attribute of tag.getChildren("Attribute")) {
          const key = source(
            text,
            attribute.getChild("AttributeName"),
          ).toLowerCase();
          const value = source(
            text,
            attribute.getChild("AttributeValue"),
          ).replace(/^["']|["']$/g, "");
          if (key === "id" && value) label += `#${value}`;
          if (key === "class" && value)
            label += "." + value.trim().split(/\s+/).join(".");
        }
        if (/^h[1-6]$/i.test(tagName) || tagName.toLowerCase() === "title") {
          const close = node.getChild("CloseTag");
          const title = compact(
            text.slice(tag.to, close?.from ?? node.to).replace(/<[^>]*>/g, ""),
          );
          if (title) label += ` — ${title}`;
        }
        add(label, "tag");
        return;
      }
      if (node.name === "RuleSet") {
        const block = node.getChild("Block");
        add(text.slice(node.from, block?.from ?? node.to), "css");
        return;
      }
      if (
        /^(?:Media|Supports|Keyframes|Container|Layer|Document|Scope)Statement$/.test(
          node.name,
        )
      ) {
        const block = node.getChild("Block");
        add(text.slice(node.from, block?.from ?? node.to), "css");
        return;
      }
      const declaration = declarations[node.name];
      if (declaration) {
        const [kind, names] = declaration;
        const name = source(text, child(node, names));
        add(name + (name && ["fn", "method"].includes(kind) ? "()" : ""), kind);
        return;
      }
      if (["ArrowFunction", "FunctionExpression"].includes(node.name)) {
        // Named callbacks assigned to variables/fields are useful; anonymous
        // callbacks passed to a call are deliberately omitted.
        const parent = node.parent;
        if (
          !parent ||
          ![
            "VariableDeclaration",
            "PropertyDeclaration",
            "AssignmentExpression",
          ].includes(parent.name)
        )
          return;
        let previous = node.prevSibling;
        while (
          previous &&
          ![
            "VariableDefinition",
            "PropertyDefinition",
            "VariableName",
          ].includes(previous.name)
        ) {
          if (previous.name === ",") return;
          previous = previous.prevSibling;
        }
        if (previous)
          add(source(text, previous) + "()", "fn", {
            from: previous.from,
            to: node.to,
          });
      }
    },
  });
}

export async function documentOutline(
  path: string,
  text: string,
): Promise<OutlineResult> {
  const extension = path.split(".").pop()?.toLowerCase() || "";
  if (!extensions.has(extension))
    return {
      entries: [],
      message: "No document outline is available for this file type.",
    };
  if (text.length > 2_000_000)
    return {
      entries: [],
      message: "Document outline supports files up to 2 MB.",
    };
  const found: Candidate[] = [];
  const markdown = ["md", "markdown", "mdown"].includes(extension);
  if (markdown) {
    for (const section of markdownSections(text)) {
      if (found.length > MAX_ENTRIES) break;
      found.push({
        label: compact(section.title),
        kind: `h${section.level}`,
        from: section.from,
        to: section.to,
        depth: section.level - 1,
        headingIndex: section.index,
        section,
      });
    }
  } else {
    const tree = await parse(extension, text);
    collect(tree, text, found);
    if (/^(?:php\d?|phtml)$/.test(extension)) {
      // PHP's HTML overlay spans multiple Text nodes. Mask only PHP syntax so
      // tags surrounding PHP blocks still form one tree with original offsets.
      const parts: string[] = [];
      let offset = 0;
      tree.iterate({
        enter(node) {
          if (
            node.name !== "Text" ||
            node.node.parent?.name !== "TextInterpolation"
          )
            return;
          parts.push(
            text.slice(offset, node.from).replace(/[^\r\n]/g, " "),
            text.slice(node.from, node.to),
          );
          offset = node.to;
        },
      });
      if (parts.length) {
        parts.push(text.slice(offset).replace(/[^\r\n]/g, " "));
        const markup = parts.join("");
        const elements: Candidate[] = [];
        collect(await parse("html", markup), markup, elements);
        found.push(...elements);
      }
    }
  }
  found.sort((a, b) => a.from - b.from || b.to - a.to);
  const parents: Candidate[] = [];
  let line = 1,
    position = 0;
  const entries = found.slice(0, MAX_ENTRIES).map((item) => {
    while (position < item.from) if (text[position++] === "\n") line++;
    while (
      parents.length &&
      (item.from >= parents[parents.length - 1].to ||
        item.to > parents[parents.length - 1].to)
    )
      parents.pop();
    const depth = item.depth ?? parents.length;
    if (!markdown) parents.push(item);
    return { ...item, depth, line };
  });
  return {
    entries,
    ...(found.length > MAX_ENTRIES
      ? { message: `Showing the first ${MAX_ENTRIES} outline items.` }
      : {}),
  };
}
