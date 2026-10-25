import { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { assetURL, basename } from "../lib/markdown";
import { useContextMenu } from "./ContextMenu";
import { revealLabel } from "../lib/edit-menu";
import { copyImage } from "../lib/image-clipboard";

type View = { scale: number; x: number; y: number; fitted: boolean };

export function ImagePreview({
  path,
  source = assetURL(path, basename(path)),
  localPath = path,
}: {
  path: string;
  source?: string;
  localPath?: string | null;
}) {
  const { openMenu } = useContextMenu();
  const viewport = useRef<HTMLDivElement>(null);
  const dimensions = useRef({ width: 0, height: 0 });
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0, fitted: true });
  const [view, setView] = useState(viewRef.current);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  function update(next: View) {
    viewRef.current = next;
    setView(next);
  }
  function fitScale() {
    const host = viewport.current;
    const size = dimensions.current;
    if (!host || !size.width || !size.height) return 1;
    return Math.min(
      1,
      Math.max(1, host.clientWidth - 48) / size.width,
      Math.max(1, host.clientHeight - 48) / size.height,
    );
  }
  function center(scale: number, fitted: boolean) {
    const host = viewport.current;
    if (
      !host ||
      !dimensions.current.width ||
      !host.clientWidth ||
      !host.clientHeight
    )
      return;
    update({
      scale,
      fitted,
      x: (host.clientWidth - dimensions.current.width * scale) / 2,
      y: (host.clientHeight - dimensions.current.height * scale) / 2,
    });
  }
  function zoom(factor: number, x?: number, y?: number) {
    const host = viewport.current;
    if (!host || !dimensions.current.width) return;
    const before = viewRef.current;
    const scale = Math.max(
      Math.min(0.05, fitScale()),
      Math.min(16, before.scale * factor),
    );
    const anchorX = x ?? host.clientWidth / 2;
    const anchorY = y ?? host.clientHeight / 2;
    const ratio = scale / before.scale;
    update({
      scale,
      fitted: false,
      x: anchorX - (anchorX - before.x) * ratio,
      y: anchorY - (anchorY - before.y) * ratio,
    });
  }
  // Native non-passive listener prevents wheel/pinch gestures from scrolling or
  // zooming the whole app. Refs keep rapid wheel events on the latest transform.
  const wheelRef = useRef<(event: WheelEvent) => void>(() => {});
  wheelRef.current = (event) => {
    if (!dimensions.current.width || !event.deltaY) return;
    event.preventDefault();
    const host = viewport.current!;
    const rect = host.getBoundingClientRect();
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? host.clientHeight
          : 1;
    const delta = Math.max(-300, Math.min(300, event.deltaY * unit));
    zoom(
      Math.exp(-delta * 0.002),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  };
  const resizeRef = useRef<() => void>(() => {});
  resizeRef.current = () => {
    if (viewRef.current.fitted) center(fitScale(), true);
  };
  useEffect(() => {
    const host = viewport.current!;
    const wheel = (event: WheelEvent) => wheelRef.current(event);
    host.addEventListener("wheel", wheel, { passive: false });
    const observer = new ResizeObserver(() => resizeRef.current());
    observer.observe(host);
    return () => {
      host.removeEventListener("wheel", wheel);
      observer.disconnect();
    };
  }, []);

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div className="image-preview">
      <div className="image-preview-toolbar">
        <span className="image-preview-path" data-tooltip={path}>
          {path}
        </span>
        <button
          className="icon-button small"
          aria-label="Zoom out"
          data-tooltip="Zoom out"
          disabled={!loaded}
          onClick={() => zoom(1 / 1.25)}
        >
          <Minus size={15} />
        </button>
        <button
          className="image-zoom-level"
          aria-label="Actual image size"
          data-tooltip="Actual size (100%)"
          disabled={!loaded}
          onClick={() => center(1, false)}
        >
          <span role="status" aria-label="Image zoom">
            {(view.scale * 100).toFixed(view.scale < 0.1 ? 1 : 0)}%
          </span>
        </button>
        <button
          className="icon-button small"
          aria-label="Zoom in"
          data-tooltip="Zoom in"
          disabled={!loaded}
          onClick={() => zoom(1.25)}
        >
          <Plus size={15} />
        </button>
        <button
          className="icon-button small"
          aria-label="Fit image to window"
          data-tooltip="Fit to window (double-click image)"
          disabled={!loaded}
          onClick={() => center(fitScale(), true)}
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <div
        className={"image-viewport" + (dragging ? " dragging" : "")}
        ref={viewport}
        role="region"
        aria-label="Image viewport"
        tabIndex={0}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu({
            x: event.clientX,
            y: event.clientY,
            restoreFocus: () => viewport.current?.focus(),
            items: [
              {
                label: "Fit to window",
                shortcut: "0",
                disabled: !loaded,
                run: () => center(fitScale(), true),
              },
              {
                label: "Actual size (100%)",
                shortcut: "1",
                disabled: !loaded,
                run: () => center(1, false),
              },
              {
                label: "Zoom in",
                shortcut: "+",
                disabled: !loaded,
                run: () => zoom(1.25),
              },
              {
                label: "Zoom out",
                shortcut: "−",
                disabled: !loaded,
                run: () => zoom(1 / 1.25),
              },
              null,
              {
                label: "Copy image",
                disabled: !loaded,
                run: () => copyImage(source),
              },
              {
                label: localPath ? "Copy file path" : "Copy image address",
                run: () =>
                  localPath
                    ? window.margin.copyPath(localPath)
                    : window.margin.copyText(source),
              },
              ...(localPath
                ? [
                    {
                      label: revealLabel,
                      run: () => window.margin.reveal(localPath),
                    },
                  ]
                : []),
            ],
          });
        }}
        onDoubleClick={() => center(fitScale(), true)}
        onPointerDown={(event) => {
          if (event.button !== 0 || !loaded) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          update({
            ...viewRef.current,
            fitted: false,
            x: viewRef.current.x + event.clientX - previous.x,
            y: viewRef.current.y + event.clientY - previous.y,
          });
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey || !loaded) return;
          if (event.key === "+" || event.key === "=") zoom(1.25);
          else if (event.key === "-") zoom(1 / 1.25);
          else if (event.key === "0") center(fitScale(), true);
          else if (event.key === "1") center(1, false);
          else if (event.key.startsWith("Arrow")) {
            const delta = event.shiftKey ? 100 : 30;
            update({
              ...viewRef.current,
              fitted: false,
              x:
                viewRef.current.x +
                (event.key === "ArrowLeft"
                  ? delta
                  : event.key === "ArrowRight"
                    ? -delta
                    : 0),
              y:
                viewRef.current.y +
                (event.key === "ArrowUp"
                  ? delta
                  : event.key === "ArrowDown"
                    ? -delta
                    : 0),
            });
          } else return;
          event.preventDefault();
        }}
      >
        <img
          src={source}
          alt={basename(path)}
          draggable={false}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            visibility: loaded ? "visible" : "hidden",
          }}
          onLoad={(event) => {
            dimensions.current = {
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            };
            setLoaded(true);
            setFailed(false);
            center(fitScale(), true);
          }}
          onError={() => {
            dimensions.current = { width: 0, height: 0 };
            setLoaded(false);
            setFailed(true);
          }}
        />
        {failed && <p role="status">This image could not be loaded.</p>}
      </div>
      <p className="image-preview-hint">
        Scroll to zoom · Drag to pan · Double-click to fit
      </p>
    </div>
  );
}
