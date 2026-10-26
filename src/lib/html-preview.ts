import { dirname } from "./markdown.ts";
import { isSVG } from "./document-mode.ts";

export function htmlPreviewDocument(path: string, text: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(isSVG(path) ? "" : text, "text/html");
  if (isSVG(path)) {
    const svg = parser.parseFromString(text, "image/svg+xml");
    if (
      svg.documentElement.localName === "svg" &&
      svg.documentElement.namespaceURI === "http://www.w3.org/2000/svg" &&
      !svg.querySelector("parsererror")
    ) {
      doc.body.append(doc.importNode(svg.documentElement, true));
      const style = doc.createElement("style");
      style.textContent =
        "html, body { margin: 0; } body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; box-sizing: border-box; } body > svg { display: block; max-width: 100%; max-height: calc(100vh - 48px); }";
      doc.head.append(style);
    } else {
      const message = doc.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent =
        "Unable to preview this SVG. Correct the SVG markup in Source.";
      doc.body.append(message);
    }
  }
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
