import { useEffect, useState } from "react";
import type { Entry, Tab } from "../types";
import { quickFiles } from "../lib/quick-open";
import { isMarkdown } from "../lib/markdown";
import { markdownSections, type Section } from "../lib/sections";
const fileHref = (path: string) =>
  "/" +
  path
    .split("/")
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!'()*]/g,
        (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
      ),
    )
    .join("/");
export function LinkPicker({
  entries,
  tabs,
  onChoose,
}: {
  entries: Entry[];
  tabs: Tab[];
  onChoose(href: string): void;
}) {
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [sections, setSections] = useState<Section[]>([]),
    [sectionQuery, setSectionQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [truncated, setTruncated] = useState(false);
  const buffer = tabs.find((tab) => tab.path === selected)?.text;
  useEffect(() => {
    let stale = false;
    setSections([]);
    setError("");
    setSectionQuery("");
    setTruncated(false);
    setLoading(!!selected && isMarkdown(selected));
    if (!selected || !isMarkdown(selected)) return;
    void (
      buffer === undefined
        ? window.margin.read(selected).then((doc) => doc.text)
        : Promise.resolve(buffer)
    )
      .then((text) => {
        if (!stale) {
          if (text.length > 2_000_000) {
            setError(
              "Headings are available for files up to 2 MB. You can still link to the whole file.",
            );
            return;
          }
          const headings = markdownSections(text);
          setSections(headings.slice(0, 500));
          setTruncated(headings.length > 500);
        }
      })
      .catch((error) => {
        if (!stale) setError(error.message);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [selected, buffer]);
  return (
    <div
      className="link-picker"
      role="region"
      aria-label="Workspace link picker"
    >
      <label>
        Find a file
        <input
          autoFocus
          aria-label="Find link file"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              const first = quickFiles(entries, query, [])[0];
              if (first) {
                setSelected(first.path);
                onChoose(fileHref(first.path));
              }
            }
          }}
          placeholder="Search file names…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="link-picker-files">
        {quickFiles(entries, query, []).map((entry) => (
          <button
            type="button"
            key={entry.path}
            aria-pressed={selected === entry.path}
            onClick={() => {
              setSelected(entry.path);
              onChoose(fileHref(entry.path));
            }}
          >
            {entry.path}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <strong>{selected}</strong>
          <button type="button" onClick={() => onChoose(fileHref(selected))}>
            Link to whole file
          </button>
          {isMarkdown(selected) && (
            <>
              <input
                aria-label="Find link section"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    const first = sections.find((section) =>
                      section.title
                        .toLowerCase()
                        .includes(sectionQuery.toLowerCase()),
                    );
                    if (first)
                      onChoose(
                        fileHref(selected) +
                          "#" +
                          encodeURIComponent(first.anchor),
                      );
                  }
                }}
                placeholder="Filter headings…"
                value={sectionQuery}
                onChange={(event) => setSectionQuery(event.target.value)}
              />
              {loading && <p role="status">Loading headings…</p>}
              {truncated && <p>Showing the first 500 headings.</p>}
              <div className="link-picker-sections">
                {sections
                  .filter((section) =>
                    section.title
                      .toLowerCase()
                      .includes(sectionQuery.toLowerCase()),
                  )
                  .map((section) => (
                    <button
                      type="button"
                      key={section.anchor}
                      style={{ paddingLeft: 8 + section.level * 8 }}
                      onClick={() =>
                        onChoose(
                          fileHref(selected) +
                            "#" +
                            encodeURIComponent(section.anchor),
                        )
                      }
                    >
                      {section.title}
                    </button>
                  ))}
                {!sections.length && !error && !loading && (
                  <p>No headings in this file.</p>
                )}
              </div>
            </>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
