// Syntax-only analysis: document contents and PHP includes are never executed.
import { parser as phpParser } from "@lezer/php";
import { parser as cssParser } from "@lezer/css";
import { parser as htmlParser } from "@lezer/html";

export const isPhp = (name) => /\.(php\d?|phtml)$/i.test(name);
export const isWebCode = (name) => /\.(html?|php\d?|phtml|css)$/i.test(name);
const textOf = (text, node) => (node ? text.slice(node.from, node.to) : "");
const children = (node) => {
  const result = [];
  for (let child = node.firstChild; child; child = child.nextSibling)
    result.push(child);
  return result;
};
const compact = (text) => text.replace(/\s+/g, " ").trim();
const unquote = (text) => text.replace(/^(['"])([\s\S]*)\1$/, "$2");
const qualify = (namespace, name) =>
  [namespace, name].filter(Boolean).join("\\");

export function workspaceTarget(from, href) {
  if (!href || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(href)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(href.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  if (!decoded || /[\0\\]/.test(decoded)) return null;
  const parts = decoded.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

export function phpSymbols(text, path = "") {
  const tree = phpParser.parse(text),
    functions = [],
    variables = [],
    classes = [],
    imports = [],
    includes = [],
    namespaces = [];
  const walk = (
    node,
    namespace = "",
    owner = "",
    scope = { from: 0, to: text.length },
    inFunction = false,
  ) => {
    for (const child of children(node)) {
      if (child.name === "NamespaceDefinition") {
        const name =
          child.getChild("QualifiedName") ||
          child.getChild("Name") ||
          child.getChild("NamespaceName");
        const value = textOf(text, name),
          block = child.getChild("Block");
        if (block) {
          namespaces.push({ name: value, from: block.from, to: block.to });
          walk(block, value, "", { from: block.from, to: block.to });
        } else {
          namespace = value;
          const next = children(node).find(
            (n) => n.from > child.from && n.name === "NamespaceDefinition",
          );
          namespaces.push({
            name: value,
            from: child.from,
            to: next?.from ?? node.to,
          });
        }
        continue;
      }
      if (child.name === "NamespaceUseDeclaration" && !inFunction) {
        const raw = textOf(text, child);
        // Simple and grouped `use function` imports, including aliases.
        const match = /^use\s+function\s+([\s\S]*);?$/.exec(raw);
        if (match) {
          const body = match[1].replace(/;$/, "").trim();
          const group = /^(.*?)\{([\s\S]*)\}$/.exec(body);
          for (const item of (group ? group[2] : body).split(",")) {
            const [target, alias] = item.trim().split(/\s+as\s+/i);
            const full = ((group ? group[1] : "") + target).replace(/^\\/, "");
            imports.push({
              name: alias || full.split("\\").pop(),
              target: full,
              namespace,
            });
          }
        }
      }
      if (/^(?:Class|Interface|Trait|Enum)Declaration$/.test(child.name)) {
        const name = textOf(text, child.getChild("Name"));
        const fullName = qualify(namespace, name);
        classes.push({ name, fullName, path, from: child.from });
        walk(child, namespace, fullName, scope, false);
        continue;
      }
      if (
        /^(?:FunctionDefinition|MethodDeclaration|AnonymousFunction|ArrowFunction)$/.test(
          child.name,
        )
      ) {
        const nameNode = child.getChild("Name"),
          params = child.getChild("ParamList");
        const parameters = children(params || child)
          .filter((n) =>
            /^(Parameter|VariadicParameter|PropertyPromotionParameter)$/.test(
              n.name,
            ),
          )
          .map((n) => ({
            label: compact(textOf(text, n)),
            name: textOf(text, n.getChild("VariableName")),
          }));
        if (nameNode) {
          const name = textOf(text, nameNode);
          const colon = children(child).find((n) => n.name === ":");
          const returns = colon ? compact(textOf(text, colon.nextSibling)) : "";
          const previous = child.prevSibling;
          const info =
            previous?.name === "BlockComment" &&
            textOf(text, previous).startsWith("/**")
              ? compact(
                  textOf(text, previous)
                    .replace(/^\/\*\*|\*\/$/g, "")
                    .replace(/^\s*\* ?/gm, "")
                    .split(/\s+@/)[0],
                )
              : "";
          functions.push({
            name,
            fullName: owner ? owner + "::" + name : qualify(namespace, name),
            namespace,
            owner: child.name === "MethodDeclaration" ? owner : "",
            parameters,
            signature:
              name +
              "(" +
              parameters.map((p) => p.label).join(", ") +
              ")" +
              (returns ? ": " + returns : ""),
            info,
            path,
            from: child.from,
            to: child.to,
          });
        }
        const localScope = { from: child.from, to: child.to };
        walk(child, namespace, owner, localScope, true);
        continue;
      }
      if (child.name === "VariableName") {
        variables.push({
          name: textOf(text, child),
          from: child.from,
          scopeFrom: scope.from,
          scopeTo: scope.to,
          local: inFunction,
        });
      }
      if (/^(?:Include|Require)Expression$/.test(child.name)) {
        // Resolve only literal includes (optionally prefixed with __DIR__).
        const raw = textOf(text, child)
          .replace(/^(?:include|require)(?:_once)?\s*/i, "")
          .replace(/^\((.*)\)$/s, "$1")
          .trim();
        const literal = /^(?:__DIR__\s*\.\s*)?(['"])([^'"$]+)\1$/.exec(raw);
        if (literal) {
          const href = raw.startsWith("__DIR__")
            ? literal[2].replace(/^\//, "")
            : literal[2];
          const target = workspaceTarget(path, href);
          if (target) includes.push(target);
        }
      }
      walk(child, namespace, owner, scope, inFunction);
    }
  };
  walk(tree.topNode);
  // Preserve only actual HTML ranges; PHP strings and comments never become tags.
  const chars = text.split("").map((c) => (c === "\n" || c === "\r" ? c : " "));
  tree.iterate({
    enter(node) {
      if (node.name === "Text")
        for (let i = node.from; i < node.to; i++) chars[i] = text[i];
    },
  });
  return {
    functions,
    variables,
    classes,
    imports,
    includes,
    namespaces,
    html: chars.join(""),
  };
}

const cssName = (name) =>
  name.replace(/\\([0-9a-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, char) => {
    if (!hex) return char;
    const code = parseInt(hex, 16);
    return code && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : "\ufffd";
  });
export function cssSymbols(text) {
  const classes = new Set(),
    ids = new Set(),
    imports = [];
  cssParser.parse(text).iterate({
    enter(node) {
      if (node.name === "ClassName") classes.add(cssName(textOf(text, node)));
      if (node.name === "IdName")
        ids.add(cssName(textOf(text, node).replace(/^#/, "")));
      if (node.name === "ImportStatement") {
        const raw = textOf(text, node);
        const match =
          /^@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)]+))/i.exec(
            raw,
          );
        if (match) imports.push(match[1] || match[2] || match[3]);
      }
    },
  });
  return { classes: [...classes], ids: [...ids], imports };
}

export function htmlSymbols(text) {
  const stylesheets = [],
    ids = new Set(),
    classes = new Set(),
    inlineStyles = [];
  htmlParser.parse(text).iterate({
    enter(node) {
      if (node.name === "StyleText") inlineStyles.push(textOf(text, node));
      if (node.name !== "OpenTag" && node.name !== "SelfClosingTag") return;
      const attrs = Object.fromEntries(
        node.node
          .getChildren("Attribute")
          .map((attr) => [
            textOf(text, attr.getChild("AttributeName")).toLowerCase(),
            unquote(
              textOf(
                text,
                attr.getChild("AttributeValue") ||
                  attr.getChild("UnquotedAttributeValue"),
              ),
            ),
          ]),
      );
      if (
        textOf(text, node.node.getChild("TagName")).toLowerCase() === "link" &&
        /(?:^|\s)stylesheet(?:\s|$)/i.test(attrs.rel || "") &&
        attrs.href
      )
        stylesheets.push(attrs.href);
      if (attrs.id && !/\s/.test(attrs.id)) ids.add(attrs.id);
      for (const name of (attrs.class || "").split(/\s+/).filter(Boolean))
        classes.add(name);
    },
  });
  return { stylesheets, ids: [...ids], classes: [...classes], inlineStyles };
}

export function phpCallAt(text, pos) {
  const tree = phpParser.parse(text);
  let node = tree.resolveInner(pos, -1);
  for (let context = node; context; context = context.parent)
    if (/Comment|^Text$/.test(context.name)) return null;
  for (; node; node = node.parent) {
    if (node.name !== "ArgList" || text[node.from] !== "(") continue;
    if (node.lastChild?.name === ")" && pos >= node.to) continue;
    const callee = node.prevSibling;
    if (!callee || node.parent?.name !== "CallExpression") continue;
    let active = 0;
    for (const child of children(node))
      if (child.name === "," && child.to <= pos) active++;
    return { name: textOf(text, callee), active, from: node.from, to: node.to };
  }
  return null;
}
