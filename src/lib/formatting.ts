import type { Plugin } from "prettier";

const parsers: Record<string, string> = {
  html: "html",
  htm: "html",
  vue: "vue",
  css: "css",
  scss: "scss",
  less: "less",
  js: "babel",
  jsx: "babel",
  mjs: "babel",
  cjs: "babel",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  json: "json-stringify",
  jsonc: "jsonc",
  json5: "json5",
  yaml: "yaml",
  yml: "yaml",
  graphql: "graphql",
  gql: "graphql",
  php: "php",
  xml: "xml",
  xsd: "xml",
  xsl: "xml",
  xslt: "xml",
  svg: "xml",
};

export function supportsFormatting(path: string) {
  return Object.hasOwn(parsers, path.split(".").pop()?.toLowerCase() || "");
}

export interface FormatRequest {
  path: string;
  text: string;
  indentSize: number;
  cursorOffset: number;
}
export interface FormatResult {
  formatted: string;
  cursorOffset: number;
}

export async function formatCode(
  request: FormatRequest,
): Promise<FormatResult> {
  const parser = parsers[request.path.split(".").pop()?.toLowerCase() || ""];
  if (!parser) throw new Error("No formatter is available for this file type.");
  if (request.text.length > 2_000_000)
    throw new Error("Automatic formatting supports files up to 2 MB.");
  if (parser === "php" && /\?>\s*\S/.test(request.text)) {
    throw new Error(
      "Mixed PHP/HTML is left unchanged; only pure PHP is formatted.",
    );
  }
  const prettier = await import("prettier/standalone");
  const plugins: Plugin[] = [];
  if (
    [
      "html",
      "vue",
      "css",
      "scss",
      "less",
      "babel",
      "typescript",
      "json-stringify",
      "jsonc",
      "json5",
    ].includes(parser)
  ) {
    // HTML can contain CSS, JS and TS. Bundle the embedded parsers too.
    const loaded = await Promise.all([
      import("prettier/plugins/html"),
      import("prettier/plugins/postcss"),
      import("prettier/plugins/babel"),
      import("prettier/plugins/estree"),
      import("prettier/plugins/typescript"),
    ]);
    plugins.push(...loaded.map((plugin) => plugin.default));
  } else if (parser === "yaml")
    plugins.push((await import("prettier/plugins/yaml")).default);
  else if (parser === "graphql")
    plugins.push((await import("prettier/plugins/graphql")).default);
  else if (parser === "php")
    plugins.push((await import("@prettier/plugin-php/standalone")).default);
  else if (parser === "xml")
    plugins.push((await import("@prettier/plugin-xml")).default);

  return prettier.formatWithCursor(request.text, {
    parser,
    plugins,
    cursorOffset: Math.max(
      0,
      Math.min(request.cursorOffset, request.text.length),
    ),
    tabWidth: request.indentSize,
    useTabs: false,
    printWidth: 100,
    endOfLine: request.text.includes("\r\n") ? "crlf" : "lf",
    htmlWhitespaceSensitivity: "css",
    // Keep XML text whitespace and target conservative PHP syntax.
    ...{ xmlWhitespaceSensitivity: "preserve", phpVersion: "7.4" },
  });
}
