import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, RefreshCw, X } from "lucide-react";
import { ConflictDiff } from "./ConflictDiff";
import { isReadOnlyPreview } from "../lib/document-mode";
import type { Entry, Tab } from "../types";

function useContents(
  path: string,
  tabs: Tab[],
  revision: number,
): { text?: string; error?: string } {
  const tab = tabs.find((tab) => tab.path === path);
  const [result, setResult] = useState<{
    path: string;
    revision: number;
    text?: string;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!path || tab) return;
    let stale = false;
    void window.margin.read(path).then(
      (doc) => {
        if (!stale) setResult({ path, revision, text: doc.text });
      },
      (error: Error) => {
        if (!stale)
          setResult({
            path,
            revision,
            error: error.message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            ),
          });
      },
    );
    return () => {
      stale = true;
    };
  }, [path, !!tab, revision]);
  if (tab) return { text: tab.text };
  return result?.path === path && result.revision === revision ? result : {};
}

export function CompareFilesDialog({
  initialLeft,
  initialRight,
  entries,
  tabs,
  onClose,
}: {
  initialLeft: string;
  initialRight: string;
  entries: Entry[];
  tabs: Tab[];
  onClose(): void;
}) {
  const [pair, setPair] = useState({ left: initialLeft, right: initialRight });
  const [revision, setRevision] = useState(0);
  const originalFocus = useRef(document.activeElement);
  useEffect(
    () => () => {
      const target = originalFocus.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    },
    [],
  );
  const files = useMemo(
    () =>
      [
        ...new Set([
          ...entries
            .filter((entry) => !entry.directory)
            .map((entry) => entry.path),
          ...tabs.map((tab) => tab.path),
          pair.left,
          pair.right,
        ]),
      ]
        .filter((path) => path && !isReadOnlyPreview(path))
        .sort((a, b) => a.localeCompare(b)),
    [entries, tabs, pair],
  );
  const left = useContents(pair.left, tabs, revision);
  const right = useContents(pair.right, tabs, revision);
  const ready = left.text !== undefined && right.text !== undefined;
  return (
    <div
      className="modal-scrim compare-scrim"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <section
        className="action-dialog compare-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Compare files"
      >
        <div className="dialog-heading">
          <h2>Compare files</h2>
          <button
            className="icon-button"
            aria-label="Close comparison"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <p>
          Read-only comparison · includes unsaved editor contents. Choose the
          exercise on the left and the solution on the right.
        </p>
        <div className="compare-files">
          {(["left", "right"] as const).map((side) => (
            <label key={side}>
              {side === "left"
                ? "Left file (exercise)"
                : "Right file (solution)"}
              <select
                aria-label={
                  side === "left"
                    ? "Left file (exercise)"
                    : "Right file (solution)"
                }
                autoFocus={side === "right"}
                value={pair[side]}
                onChange={(event) =>
                  setPair({ ...pair, [side]: event.target.value })
                }
              >
                <option value="">Choose a file…</option>
                {files.map((path) => (
                  <option key={path} value={path}>
                    {path}
                    {tabs.some((tab) => tab.path === path && tab.dirty)
                      ? " · Unsaved"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="compare-actions">
          <span>
            <span className="diff-mine">− Left changes</span>{" "}
            <span className="diff-disk">+ Right changes</span> · striped rows
            align missing lines
          </span>
          <button
            disabled={!pair.left || !pair.right}
            onClick={() => setPair({ left: pair.right, right: pair.left })}
          >
            <ArrowLeftRight size={14} /> Swap files
          </button>
          <button onClick={() => setRevision((value) => value + 1)}>
            <RefreshCw size={14} /> Refresh comparison
          </button>
        </div>
        {left.error && (
          <p role="alert">
            {pair.left}: {left.error}
          </p>
        )}
        {right.error && (
          <p role="alert">
            {pair.right}: {right.error}
          </p>
        )}
        {ready ? (
          <ConflictDiff
            key={pair.left + ":" + pair.right}
            mine={left.text!}
            disk={right.text!}
            leftTitle={pair.left}
            rightTitle={pair.right}
            navigable
          />
        ) : (
          <p role="status">
            {!pair.left || !pair.right
              ? "Choose two text files to compare."
              : left.error || right.error
                ? "Choose another file or refresh to try again."
                : "Loading files…"}
          </p>
        )}
      </section>
    </div>
  );
}
