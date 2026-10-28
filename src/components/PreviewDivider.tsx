import { useRef, useState } from "react";

export function PreviewDivider({
  ratio,
  codePath,
  onChange,
}: {
  ratio: number;
  codePath: string;
  onChange(ratio: number): void;
}) {
  const drag = useRef<{ left: number; width: number; handle: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const change = (value: number) =>
    onChange(Math.max(20, Math.min(80, Math.round(value))));
  return (
    <div
      className="preview-divider"
      role="separator"
      aria-label="Resize code and live preview"
      aria-orientation="vertical"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={ratio}
      aria-valuetext={`${ratio}% code, ${100 - ratio}% preview`}
      data-dragging={dragging}
      tabIndex={0}
      title="Drag to resize · Double-click for equal widths"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const parent = event.currentTarget.parentElement;
        const code = Array.from(
          parent?.querySelectorAll<HTMLElement>(".editor-pane") || [],
        ).find((pane) => pane.dataset.path === codePath);
        const preview = parent?.querySelector<HTMLElement>(".live-preview");
        if (!code || !preview) return;
        event.preventDefault();
        const left = code.getBoundingClientRect().left;
        const handle = event.currentTarget.getBoundingClientRect().width;
        drag.current = {
          left,
          handle,
          width: preview.getBoundingClientRect().right - left - handle,
        };
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start && start.width > 0)
          change(
            ((event.clientX - start.left - start.handle / 2) / start.width) *
              100,
          );
      }}
      onPointerUp={(event) => {
        drag.current = null;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => change(50)}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        change(
          event.key === "Home"
            ? 20
            : event.key === "End"
              ? 80
              : ratio +
                (event.key === "ArrowRight" ? 1 : -1) *
                  (event.shiftKey ? 10 : 2),
        );
      }}
    />
  );
}
