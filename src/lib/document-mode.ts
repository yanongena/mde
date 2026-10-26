import { isImage, isMarkdown, visualProtection } from "./markdown.ts";

export const isPDF = (path: string) => /\.pdf$/i.test(path);
export const isReadOnlyPreview = (path: string) => isImage(path) || isPDF(path);

export const isHTML = (path: string) => /\.html?$/i.test(path);
export const isSVG = (path: string) => /\.svg$/i.test(path);
export const previewType = (path: string) =>
  isHTML(path) ? "HTML" : isSVG(path) ? "SVG" : null;
export const supportsVisualMode = (path: string) =>
  isMarkdown(path) || previewType(path) !== null;

export function documentMode(
  path: string,
  text: string,
  preferred?: "visual" | "source",
): "visual" | "source" {
  if (!supportsVisualMode(path) || (isMarkdown(path) && visualProtection(text)))
    return "source";
  return preferred ?? (isMarkdown(path) ? "visual" : "source");
}
