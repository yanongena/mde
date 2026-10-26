import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { assetURL, splitMetadata } from "./markdown.ts";
import { markdownSections } from "./sections.ts";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize);
const serializer = unified().use(rehypeStringify);

export function markdownPreviewHTML(path: string, text: string): string {
  const { body, prefix } = splitMetadata(text);
  const tree = processor.runSync(processor.parse(body));
  const sections = new Map(
    markdownSections(text).map((section) => [section.from, section]),
  );
  visit(tree, "element", (node) => {
    const offset = node.position?.start.offset;
    if (offset !== undefined) {
      const from = offset + prefix.length;
      node.properties.dataSourceFrom = from;
      const section = sections.get(from);
      if (section && /^h[1-6]$/.test(node.tagName))
        node.properties.id = section.anchor;
    }
    if (node.tagName === "img")
      node.properties.src = assetURL(path, String(node.properties.src || ""));
  });
  return serializer.stringify(tree);
}
