import { useEffect, useMemo, useRef, useState } from "react";
import { selectionRoots } from "../../electron/selection.mjs";
import { dirname, isMarkdown } from "../lib/markdown";
import { setDraggedMarkdown } from "../lib/markdown-file-drop";
import { createMoveValidator } from "../lib/explorer-move";
import type { Entry } from "../types";

type Destination = { directory: string; problem: string };
export function useExplorerDrag({
  entries,
  expand,
  move,
}: {
  entries: Entry[];
  expand(directory: string): void;
  move(paths: string[], directory: string): void;
}) {
  const tree = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [scrolling, setScrolling] = useState<"up" | "down" | null>(null);
  const session = useRef<{
    paths: string[];
    point: { x: number; y: number } | null;
    destination: Destination | null;
    frame: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ paths: [], point: null, destination: null, frame: 0, timer: null });
  const index = useMemo(
    () => new Map(entries.map((entry) => [entry.path, entry])),
    [entries],
  );
  const validate = useMemo(
    () => createMoveValidator(paths, entries),
    [paths, entries],
  );
  const latest = useRef({ index, validate, expand, move });
  latest.current = { index, validate, expand, move };

  function clearHover() {
    const current = session.current;
    if (current.timer) clearTimeout(current.timer);
    cancelAnimationFrame(current.frame);
    current.timer = null;
    current.frame = 0;
    current.point = null;
    current.destination = null;
    setDestination(null);
    setScrolling(null);
  }
  function end() {
    setDraggedMarkdown(null);
    clearHover();
    session.current.paths = [];
    setPaths([]);
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") end();
    };
    document.addEventListener("dragend", end);
    document.addEventListener("drop", end);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", end);
    return () => {
      document.removeEventListener("dragend", end);
      document.removeEventListener("drop", end);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("blur", end);
      if (session.current.timer) clearTimeout(session.current.timer);
      cancelAnimationFrame(session.current.frame);
    };
  }, []);

  function targetAt(x: number, y: number): Destination | null {
    const element = document.elementFromPoint(x, y);
    const surface = element?.closest<HTMLElement>("[data-explorer-drop]");
    if (!surface) return null;
    const row = element?.closest<HTMLElement>("[data-explorer-path]");
    const entry = latest.current.index.get(row?.dataset.explorerPath || "");
    const directory = entry
      ? entry.directory
        ? entry.path
        : dirname(entry.path)
      : "";
    return {
      directory,
      problem: latest.current.validate(directory),
    };
  }
  function showTarget(next: Destination | null) {
    const current = session.current;
    if (
      current.destination?.directory === next?.directory &&
      current.destination?.problem === next?.problem
    )
      return;
    if (current.timer) clearTimeout(current.timer);
    current.timer = null;
    current.destination = next;
    setDestination(next);
    if (next?.directory && !next.problem) {
      current.timer = setTimeout(
        () => latest.current.expand(next.directory),
        650,
      );
    }
  }
  function tick(time: number, previous = time) {
    const current = session.current,
      point = current.point,
      element = tree.current;
    if (!point || !current.paths.length) return;
    if (element) {
      const rect = element.getBoundingClientRect();
      const within =
        point.x >= rect.left &&
        point.x < rect.right &&
        point.y >= rect.top &&
        point.y < rect.bottom;
      const edge = Math.min(64, rect.height / 4);
      const speed = !within
        ? 0
        : point.y < rect.top + edge
          ? -Math.min(1, (rect.top + edge - point.y) / edge)
          : point.y > rect.bottom - edge
            ? Math.min(1, (point.y - rect.bottom + edge) / edge)
            : 0;
      const before = element.scrollTop;
      element.scrollTop += (speed * 650 * Math.min(40, time - previous)) / 1000;
      setScrolling(
        element.scrollTop === before ? null : speed < 0 ? "up" : "down",
      );
    }
    // Re-hit-test after scrolling or opening a folder, even if the pointer stays still.
    showTarget(targetAt(point.x, point.y));
    current.frame = requestAnimationFrame((next) => tick(next, time));
  }
  function begin(event: React.DragEvent, selected: string[]) {
    end();
    const roots = selectionRoots(selected);
    const entry = latest.current.index.get(roots[0]);
    setDraggedMarkdown(
      roots.length === 1 && entry && !entry.directory && isMarkdown(entry.path)
        ? entry.path
        : null,
    );
    session.current.paths = roots;
    setPaths(roots);
    event.dataTransfer.setData(
      "application/x-margin-paths",
      JSON.stringify(roots),
    );
    event.dataTransfer.setData("application/x-margin-path", roots[0]);
    event.dataTransfer.effectAllowed = "all";
  }
  function over(event: React.DragEvent) {
    if (!session.current.paths.length) return;
    event.preventDefault();
    event.stopPropagation();
    const next = targetAt(event.clientX, event.clientY);
    showTarget(next);
    event.dataTransfer.dropEffect = next && !next.problem ? "move" : "none";
    session.current.point = { x: event.clientX, y: event.clientY };
    if (!session.current.frame)
      session.current.frame = requestAnimationFrame((time) => tick(time));
  }
  function drop(event: React.DragEvent) {
    if (!session.current.paths.length) return;
    event.preventDefault();
    event.stopPropagation();
    const next = targetAt(event.clientX, event.clientY),
      selected = session.current.paths;
    end();
    if (next && !next.problem) latest.current.move(selected, next.directory);
  }
  function leave(event: React.DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
      clearHover();
  }
  return { tree, paths, destination, scrolling, begin, end, over, drop, leave };
}
