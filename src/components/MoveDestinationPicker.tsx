import { useMemo, useState } from "react";
import { Folder, Search } from "lucide-react";
import { movePath, createMoveValidator } from "../lib/explorer-move";
import type { Entry } from "../types";

export function MoveDestinationPicker({
  entries,
  paths,
  directory,
  onChange,
}: {
  entries: Entry[];
  paths: string[];
  directory: string;
  onChange(directory: string): void;
}) {
  const [query, setQuery] = useState("");
  const validate = useMemo(
    () => createMoveValidator(paths, entries),
    [paths, entries],
  );
  const problem = validate(directory);
  const folders = [
    "",
    ...entries.filter((entry) => entry.directory).map((entry) => entry.path),
  ]
    .filter(
      (path) =>
        !paths.some(
          (source) => path === source || path.startsWith(source + "/"),
        ),
    )
    .filter((path) =>
      (path || "Workspace root").toLowerCase().includes(query.toLowerCase()),
    );
  return (
    <div className="move-picker">
      <label className="move-folder-search">
        <Search size={14} />
        <input
          aria-label="Find destination folder"
          placeholder="Find a folder…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      <div
        className="move-folder-list"
        role="group"
        aria-label="Destination folders"
      >
        {folders.map((path) => {
          const issue = validate(path);
          return (
            <button
              type="button"
              key={path}
              aria-pressed={directory === path}
              disabled={!!issue}
              title={issue || path || "Workspace root"}
              onClick={() => onChange(path)}
            >
              <Folder size={15} />
              <span>{path || "Workspace root"}</span>
            </button>
          );
        })}
        {!folders.length && <p>No matching folders.</p>}
      </div>
      <div className="move-preview" role="status">
        {problem || (
          <>
            <strong>Destination</strong>
            {paths.map((path) => (
              <span key={path}>{movePath(path, directory)}</span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
