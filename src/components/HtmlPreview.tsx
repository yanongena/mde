import { useEffect, useMemo, useRef } from "react";
import { htmlPreviewDocument } from "../lib/html-preview";
import { previewType } from "../lib/document-mode";
import {
  positionChanged,
  registerEditor,
  textSignature,
} from "../lib/editor-position";
import type { EditorPosition } from "../types";

export function HtmlPreview({
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
  const content = useMemo(() => htmlPreviewDocument(path, text), [path, text]);
  const format = previewType(path) ?? "HTML";
  const frame = useRef<HTMLIFrameElement>(null);
  const saved = useRef(position);
  const textRef = useRef(text);
  textRef.current = text;
  const callbacks = useRef({ onLink, onActivate });
  callbacks.current = { onLink, onActivate };
  useEffect(
    () =>
      registerEditor(path, "visual", {
        focus: () => frame.current?.focus(),
        capture: () => {
          const win = frame.current?.contentWindow;
          const scroll = frame.current?.contentDocument?.scrollingElement;
          return {
            anchor: 0,
            head: 0,
            sourceAnchor: 0,
            sourceHead: 0,
            topSource: 0,
            topOffset: 0,
            ...saved.current,
            mode: "visual",
            scrollTop: win?.scrollY ?? 0,
            scrollRatio:
              (win?.scrollY ?? 0) /
              Math.max(
                1,
                (scroll?.scrollHeight ?? 0) - (scroll?.clientHeight ?? 0),
              ),
            signature: textSignature(textRef.current),
          };
        },
        restore: (position, focus = true) => {
          saved.current = position;
          if (position.mode === "visual")
            frame.current?.contentWindow?.scrollTo(0, position.scrollTop);
          if (focus) frame.current?.focus();
        },
        reveal: () => frame.current?.focus(),
      }),
    [path],
  );
  return (
    <div className="html-preview">
      <div className="html-preview-toolbar">
        {format} preview · Edit in Source
      </div>
      <iframe
        ref={frame}
        title={`${format} preview for ${path}`}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        srcDoc={content}
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument;
          if (!doc) return;
          if (saved.current?.mode === "visual")
            event.currentTarget.contentWindow?.scrollTo(
              0,
              saved.current.scrollTop,
            );
          doc.addEventListener("scroll", () => positionChanged(path, "scroll"));
          doc.addEventListener("pointerdown", () =>
            callbacks.current.onActivate(),
          );
          doc.addEventListener("submit", (event) => event.preventDefault());
          doc.addEventListener("click", (event) => {
            const link = (event.target as Element).closest(
              "a[href], area[href]",
            );
            if (!link) return;
            event.preventDefault();
            const href = link.getAttribute("href") || "";
            if (href.startsWith("#")) {
              try {
                doc
                  .getElementById(decodeURIComponent(href.slice(1)))
                  ?.scrollIntoView();
              } catch {
                /* Ignore invalid fragment escapes. */
              }
            } else callbacks.current.onLink(href);
          });
          // App shortcuts must also work while the preview has keyboard focus.
          doc.addEventListener("keydown", (event) => {
            if (
              !(event.ctrlKey || event.metaKey || event.altKey) &&
              event.key !== "Escape"
            )
              return;
            const forwarded = new KeyboardEvent("keydown", {
              key: event.key,
              code: event.code,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              cancelable: true,
            });
            if (!window.dispatchEvent(forwarded)) event.preventDefault();
          });
        }}
      />
    </div>
  );
}
