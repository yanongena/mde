import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { SearchOptions, SearchResults, SearchMatch, Tab } from "../types";

export const emptySearch: SearchOptions = {
  query: "",
  include: "",
  exclude: "",
  caseSensitive: false,
  wholeWord: false,
};
export function WorkspaceSearch({
  root,
  options,
  onChange,
  tabs,
  onOpen,
  onClose,
}: {
  root: string;
  options: SearchOptions;
  onChange(options: SearchOptions): void;
  tabs: Tab[];
  onOpen(match: SearchMatch): void;
  onClose(): void;
}) {
  const [result, setResult] = useState<SearchResults | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [revision, setRevision] = useState(0);
  useEffect(
    () => window.margin.onFiles(() => setRevision((value) => value + 1)),
    [],
  );
  const overlays = JSON.stringify(
    tabs.filter((tab) => tab.dirty).map(({ path, text }) => ({ path, text })),
  );
  useEffect(() => {
    const focus = () => {
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("margin:focus-workspace-search", focus);
    return () =>
      window.removeEventListener("margin:focus-workspace-search", focus);
  }, []);
  useEffect(() => {
    let disposed = false;
    const id = crypto.randomUUID();
    setResult(null);
    setError("");
    setBusy(!!options.query && !!root);
    if (!root || !options.query) return;
    const timer = setTimeout(() => {
      void window.margin
        .search({ ...options, id, overlays: JSON.parse(overlays) })
        .then((result) => {
          if (!disposed && !result.cancelled) setResult(result);
        })
        .catch((e) => {
          if (!disposed) setError((e as Error).message);
        })
        .finally(() => {
          if (!disposed) setBusy(false);
        });
    }, 250);
    return () => {
      disposed = true;
      clearTimeout(timer);
      void window.margin.cancelSearch(id);
    };
  }, [root, options, overlays, revision]);
  const patch = (change: Partial<SearchOptions>) =>
    onChange({ ...options, ...change });
  return (
    <section className="workspace-search" aria-label="Workspace search">
      <div className="sidebar-heading">
        <span>SEARCH</span>
        <button
          className="icon-button small"
          aria-label="Show explorer"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className="workspace-search-controls">
        <label className="search-input">
          <Search size={14} />
          <input
            ref={input}
            autoFocus
            aria-label="Search workspace contents"
            placeholder="Search file contents…"
            value={options.query}
            onChange={(event) => patch({ query: event.target.value })}
          />
        </label>
        <div className="search-options">
          <label>
            <input
              type="checkbox"
              checked={options.caseSensitive}
              onChange={(event) =>
                patch({ caseSensitive: event.target.checked })
              }
            />
            Match case
          </label>
          <label>
            <input
              type="checkbox"
              checked={options.wholeWord}
              onChange={(event) => patch({ wholeWord: event.target.checked })}
            />
            Whole word
          </label>
        </div>
        <label>
          Files to include
          <input
            aria-label="Files to include"
            placeholder="*.md, src/**"
            value={options.include}
            onChange={(event) => patch({ include: event.target.value })}
          />
        </label>
        <label>
          Files to exclude
          <input
            aria-label="Files to exclude"
            placeholder="assets/**"
            value={options.exclude}
            onChange={(event) => patch({ exclude: event.target.value })}
          />
        </label>
      </div>
      <p className="search-summary" role="status">
        {!root
          ? "Open a folder to search."
          : busy
            ? "Searching…"
            : error ||
              (result
                ? `${result.matches.length}${result.truncated ? "+" : ""} matches · ${result.files} files searched${result.skipped ? ` · ${result.skipped} skipped` : ""}`
                : "Search your workspace, including unsaved edits.")}
      </p>
      {result?.truncated && (
        <p className="search-summary">
          Showing the first 500 matches. Refine your search or file filters.
        </p>
      )}
      <div className="workspace-search-results">
        {result?.matches.map((match) => (
          <button
            key={`${match.path}:${match.from}`}
            className="workspace-search-result"
            onClick={() => onOpen(match)}
            aria-label={`${match.path}, line ${match.line}, column ${match.column}`}
          >
            <strong>{match.path}</strong>
            <span>
              Line {match.line}:{match.column}
            </span>
            <code>
              {match.preview.slice(0, match.matchStart)}
              <mark>
                {match.preview.slice(match.matchStart, match.matchEnd)}
              </mark>
              {match.preview.slice(match.matchEnd)}
            </code>
          </button>
        ))}
      </div>
    </section>
  );
}
