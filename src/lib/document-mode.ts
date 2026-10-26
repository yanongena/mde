import { isMarkdown, visualProtection } from "./markdown.ts";

export const isHTML = (path: string) => /\.html?$/i.test(path);
export const supportsVisualMode = (path: string) =>
  isMarkdown(path) || isHTML(path);

export function documentMode(
  path: string,
  text: string,
  preferred?: "visual" | "source",
): "visual" | "source" {
  if (!supportsVisualMode(path) || (isMarkdown(path) && visualProtection(text)))
    return "source";
  return preferred ?? (isMarkdown(path) ? "visual" : "source");
}
