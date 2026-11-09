import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { htmlPreviewDocument } from "../lib/html-preview";
import {
  refreshPreviewAssets,
  updatePreviewDocument,
} from "../lib/html-preview-update";
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
  standalone = false,
  hideToolbar = false,
  overlays = [],
  revision = 0,
}: {
  path: string;
  text: string;
  onLink(href: string): void;
  onActivate(): void;
  position?: EditorPosition;
  standalone?: boolean;
  hideToolbar?: boolean;
  overlays?: { path: string; text: string }[];
  revision?: number;
}) {
  const content = useMemo(
    () => htmlPreviewDocument(path, text, overlays),
    [path, text, overlays],
  );
  const initial = useRef({ path, content });
  if (initial.current.path !== path) initial.current = { path, content };
  const applied = useRef<{
    document: Document;
    content: string;
    revision: number;
  } | null>(null);
  const cancelRefresh = useRef<(() => boolean) | undefined>(undefined);
  const format = previewType(path) ?? "HTML";
  const frame = useRef<HTMLIFrameElement>(null);
  const saved = useRef(position);
  const textRef = useRef(text);
  textRef.current = text;
  const callbacks = useRef({ onLink, onActivate });
  callbacks.current = { onLink, onActivate };
  function updateDocument() {
    const document = frame.current?.contentDocument;
    const previous = applied.current;
    if (!document || previous?.document !== document) return;
    const refreshing = cancelRefresh.current?.();
    const win = document.defaultView;
    const scrollTop = win?.scrollY ?? 0;
    const scrollLeft = win?.scrollX ?? 0;
    if (previous.content !== content)
      updatePreviewDocument(document, previous.content, content);
    if (previous.revision !== revision || refreshing)
      cancelRefresh.current = refreshPreviewAssets(document);
    applied.current = { document, content, revision };
    if (win && (win.scrollY !== scrollTop || win.scrollX !== scrollLeft))
      win.scrollTo(scrollLeft, scrollTop);
  }
  useLayoutEffect(updateDocument, [content, revision]);
  useEffect(
    () => () => {
      cancelRefresh.current?.();
    },
    [],
  );
  useEffect(
    () =>
      standalone
        ? undefined
        : registerEditor(path, "visual", {
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
    [path, standalone],
  );
  return (
    <div className="html-preview">
      {!hideToolbar && (
        <div className="html-preview-toolbar">
          {standalone
            ? "Live preview · Current editor contents"
            : `${format} preview · Edit in Source`}
        </div>
      )}
      <iframe
        key={path}
        ref={frame}
        title={`${format} preview for ${path}`}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        srcDoc={initial.current.content}
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument;
          if (!doc) return;
          applied.current = {
            document: doc,
            content: initial.current.content,
            revision,
          };
          updateDocument();
          if (saved.current?.mode === "visual")
            event.currentTarget.contentWindow?.scrollTo(
              0,
              saved.current.scrollTop,
            );
          doc.addEventListener("scroll", () => {
            saved.current = {
              ...saved.current,
              mode: "visual",
              scrollTop: doc.defaultView?.scrollY ?? 0,
            } as EditorPosition;
            if (!standalone) positionChanged(path, "scroll");
          });
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
              event.key !== "Escape" &&
              event.key !== "F8"
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
