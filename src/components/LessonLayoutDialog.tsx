import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Entry } from "../types";
import { isMarkdown } from "../lib/markdown";
import { isPDF } from "../lib/document-mode";
import { supportsLivePreview } from "./LivePreview";

export function LessonLayoutDialog({
  entries,
  assignment,
  code,
  onApply,
  onClose,
}: {
  entries: Entry[];
  assignment: string;
  code: string;
  onApply(assignment: string, code: string): Promise<void>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const assignments = entries.filter(
    (e) => !e.directory && (isMarkdown(e.path) || isPDF(e.path)),
  );
  const sources = entries.filter(
    (e) => !e.directory && supportsLivePreview(e.path),
  );
  const [left, setLeft] = useState(
    assignments.some((e) => e.path === assignment)
      ? assignment
      : assignments[0]?.path || "",
  );
  const [right, setRight] = useState(
    sources.some((e) => e.path === code) ? code : sources[0]?.path || "",
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="action-dialog lesson-layout-dialog"
      aria-labelledby="lesson-layout-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!left || !right || busy) return;
          setBusy(true);
          void onApply(left, right).finally(() => setBusy(false));
        }}
      >
        <div className="dialog-heading">
          <h2 id="lesson-layout-title">Lesson layout</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close lesson layout"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <p>
          Keep an assignment, source code and its result together. Explorer,
          outline and terminal make room until you restore your previous layout.
        </p>
        <label>
          Assignment
          <select
            aria-label="Lesson assignment"
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            disabled={busy || !assignments.length}
          >
            {!assignments.length && (
              <option value="">No Markdown or PDF files</option>
            )}
            {assignments.map((entry) => (
              <option key={entry.path} value={entry.path}>
                {entry.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          Code & preview
          <select
            aria-label="Lesson code"
            value={right}
            onChange={(event) => setRight(event.target.value)}
            disabled={busy || !sources.length}
          >
            {!sources.length && <option value="">No HTML or PHP files</option>}
            {sources.map((entry) => (
              <option key={entry.path} value={entry.path}>
                {entry.path}
              </option>
            ))}
          </select>
        </label>
        {(!left || !right) && (
          <p role="status">
            This layout needs a Markdown or PDF assignment and an HTML or PHP
            file in this workspace.
          </p>
        )}
        <p>PHP starts only when you choose Start PHP in the preview.</p>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !left || !right}
          >
            {busy ? "Opening…" : "Open lesson layout"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
