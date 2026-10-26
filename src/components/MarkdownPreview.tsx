import { useEffect, useMemo, useRef } from "react";
import { markdownPreviewHTML } from "../lib/markdown-preview";
import {
  registerEditor,
  positionChanged,
  textSignature,
} from "../lib/editor-position";
import type { EditorPosition } from "../types";

export function MarkdownPreview({
  path,
  text,
  onLink,
  onActivate,
  position,
}: {
  path: string;
  text: string;
  onLink(href: string): void;
  onActivate(): void;
  position?: EditorPosition;
}) {
  const html = useMemo(() => markdownPreviewHTML(path, text), [path, text]);
  const scroll = useRef<HTMLDivElement>(null);
  const initial = useRef(position);
  useEffect(() => {
    const host = scroll.current!;
    const elements = () =>
      Array.from(host.querySelectorAll<HTMLElement>("[data-source-from]"));
    const sourceFrom = (element?: HTMLElement) =>
      Number(element?.dataset.sourceFrom || 0);
    const topElement = () => {
      const top = host.getBoundingClientRect().top;
      const nodes = elements();
      return (
        nodes
          .filter((element) => element.getBoundingClientRect().top <= top + 16)
          .at(-1) || nodes[0]
      );
    };
    const reveal = (from: number, focus = true) => {
      const candidates = elements().filter(
        (element) => sourceFrom(element) <= from,
      );
      const target = candidates.at(-1);
      if (target)
        host.scrollTop +=
          target.getBoundingClientRect().top -
          host.getBoundingClientRect().top -
          16;
      if (focus) host.focus({ preventScroll: true });
    };
    const restore = (saved: EditorPosition, focus = true) => {
      if (saved.mode === "visual" && saved.signature === textSignature(text))
        host.scrollTop = saved.scrollTop;
      else reveal(saved.topSource || saved.sourceHead, false);
      if (focus) host.focus({ preventScroll: true });
    };
    const unregister = registerEditor(path, "visual", {
      focus: () => host.focus({ preventScroll: true }),
      capture: () => {
        const element = topElement();
        const from = sourceFrom(element);
        return {
          mode: "visual",
          anchor: 0,
          head: 0,
          sourceAnchor: from,
          sourceHead: from,
          topSource: from,
          topOffset: element
            ? element.getBoundingClientRect().top -
              host.getBoundingClientRect().top
            : 0,
          scrollTop: host.scrollTop,
          scrollRatio:
            host.scrollTop / Math.max(1, host.scrollHeight - host.clientHeight),
          signature: textSignature(text),
        };
      },
      restore,
      reveal: (from) => reveal(from),
    });
    if (initial.current) {
      restore(initial.current, false);
      initial.current = undefined;
    }
    return unregister;
  }, [path, text]);
  return (
    <>
      <div className="metadata-note">
        Read-only preview · Edit in Source to preserve the original Markdown
      </div>
      <div
        ref={scroll}
        className="document-scroll"
        tabIndex={0}
        aria-label="Markdown preview"
        onPointerDown={onActivate}
        onScroll={() => positionChanged(path, "scroll")}
        onClick={(event) => {
          const link = (event.target as Element).closest("a[href]");
          if (!link) return;
          event.preventDefault();
          const href = link.getAttribute("href") || "";
          if (href.startsWith("#")) {
            try {
              const id = decodeURIComponent(href.slice(1));
              const target = Array.from(
                scroll.current!.querySelectorAll<HTMLElement>("[id]"),
              ).find(
                (element) =>
                  element.id === id || element.id === `user-content-${id}`,
              );
              if (target) {
                target.scrollIntoView();
                return;
              }
            } catch {
              /* Let the normal link handler report invalid escapes. */
            }
          }
          onLink(href);
        }}
      >
        <article
          className="document-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </>
  );
}
