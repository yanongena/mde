import { dirname } from "./markdown.ts";

export function htmlPreviewDocument(path: string, text: string) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  // Keep the preview inside the workspace and prevent document-driven navigation.
  doc
    .querySelectorAll("base, meta[http-equiv], iframe, frame, object, embed")
    .forEach((element) => element.remove());
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' margin-asset: https:; img-src margin-asset: https: data: blob:; font-src margin-asset: https: data:; base-uri margin-asset:; form-action 'none'";
  const base = doc.createElement("base");
  const directory = dirname(path)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  base.href = `margin-asset://workspace/${directory ? directory + "/" : ""}`;
  doc.head.prepend(policy, base);
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
