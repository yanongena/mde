import { useEffect, useRef, useState } from "react";
import { X, ChevronRight, ChevronDown } from "lucide-react";
import {
  documentOutline,
  type OutlineEntry,
  type OutlineResult,
} from "../lib/outline";
import { sectionMenuItems } from "../lib/sections";
import { editorHandle } from "../lib/editor-position";
import { useContextMenu } from "./ContextMenu";
interface Props {
  path: string;
  text: string;
  mode?: "visual" | "source";
  onClose(): void;
  onNavigate(entry: OutlineEntry): void;
}
export function DocumentOutline({
  path,
  text,
  mode = "source",
  onClose,
  onNavigate,
}: Props) {
  const { openMenu } = useContextMenu();
  const [result, setResult] = useState<{
    path: string;
    text: string;
    outline: OutlineResult;
  } | null>(null);
  const [query, setQuery] = useState(""),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [offset, setOffset] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setQuery("");
    setCollapsed(new Set());
    setOffset(0);
  }, [path]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void documentOutline(path, text).then(
        (outline) => {
          if (!cancelled) setResult({ path, text, outline });
        },
        () => {
          if (!cancelled)
            setResult({
              path,
              text,
              outline: {
                entries: [],
                message: "The document outline could not be read.",
              },
            });
        },
      );
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, text]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = (event?: Event) => {
      const detail = (
        event as CustomEvent<{ path: string; kind: string }> | undefined
      )?.detail;
      if (detail && detail.path !== path) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const handle = editorHandle(path, mode);
        const position = handle?.capture();
        if (position)
          setOffset(
            detail?.kind === "scroll" && !handle?.selectionVisible?.()
              ? position.topSource
              : position.sourceHead,
          );
      }, 60);
    };
    update();
    window.addEventListener("margin:position-changed", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("margin:position-changed", update);
    };
  }, [path, mode]);
  const outline =
    result?.path === path && result.text === text ? result.outline : null;
  const items = outline?.entries || [];
  let active = -1;
  items.forEach((item, index) => {
    if (item.from <= offset) active = index;
  });
  const key = (item: OutlineEntry) => `${item.from}:${item.kind}:${item.label}`;
  const visible = new Set<number>();
  if (query.trim())
    items.forEach((item, index) => {
      if (!item.label.toLowerCase().includes(query.trim().toLowerCase()))
        return;
      visible.add(index);
      let depth = item.depth;
      for (let i = index - 1; i >= 0; i--)
        if (items[i].depth < depth) {
          visible.add(i);
          depth = items[i].depth;
        }
    });
  else {
    let hiddenDepth = Infinity;
    items.forEach((item, index) => {
      if (item.depth <= hiddenDepth) hiddenDepth = Infinity;
      if (hiddenDepth !== Infinity) return;
      visible.add(index);
      if (collapsed.has(key(item))) hiddenDepth = item.depth;
    });
  }
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="location"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, path]);
  return (
    <aside
      className="outline"
      id="document-outline"
      aria-label="Document outline"
    >
      <div className="sidebar-heading">
        ON THIS PAGE
        <button
          className="icon-button small"
          aria-label="Close outline"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <input
        className="outline-filter"
        aria-label="Filter outline"
        placeholder="Find heading or symbol…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!outline ? (
        <p role="status">Updating outline…</p>
      ) : (
        <div className="outline-items" ref={list}>
          {items.map((item, index) =>
            visible.has(index) ? (
              <div
                className="outline-row"
                key={key(item)}
                style={{ paddingLeft: 4 + Math.min(item.depth, 12) * 10 }}
              >
                {items[index + 1]?.depth > item.depth ? (
                  <button
                    className="outline-fold icon-button small"
                    aria-label={`${collapsed.has(key(item)) ? "Expand" : "Collapse"} ${item.label}`}
                    aria-expanded={!collapsed.has(key(item))}
                    onClick={() =>
                      setCollapsed((previous) => {
                        const next = new Set(previous);
                        if (next.has(key(item))) next.delete(key(item));
                        else next.add(key(item));
                        return next;
                      })
                    }
                  >
                    {collapsed.has(key(item)) ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                  </button>
                ) : (
                  <span className="outline-fold-space" />
                )}
                <button
                  className={
                    "outline-entry" + (index === active ? " active" : "")
                  }
                  data-tooltip={`${item.label} · Line ${item.line}`}
                  aria-label={`${item.label}, line ${item.line}`}
                  aria-current={index === active ? "location" : undefined}
                  onClick={() => onNavigate(item)}
                  onContextMenu={(event) => {
                    if (!item.section) return;
                    event.preventDefault();
                    const target = event.currentTarget;
                    openMenu({
                      x: event.clientX,
                      y: event.clientY,
                      items: sectionMenuItems(path, item.section),
                      restoreFocus: () => {
                        if (target.isConnected) target.focus();
                      },
                    });
                  }}
                >
                  <span className="outline-kind" aria-hidden="true">
                    {item.kind}
                  </span>
                  <span className="outline-label">{item.label}</span>
                </button>
              </div>
            ) : null,
          )}
          {outline.message ? (
            <p>{outline.message}</p>
          ) : !items.length ? (
            <p>No headings or symbols found in this document.</p>
          ) : !visible.size ? (
            <p>No matching headings or symbols.</p>
          ) : null}
        </div>
      )}
    </aside>
  );
}
