import { useEffect, useRef, useState } from "react";
import type {
  PdfExportOptions,
  PdfExportPlan,
  PdfExportResult,
} from "../types";

const cleanError = (error: unknown) =>
  (error as Error).message.replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );

export function PdfExportDialog({
  path,
  directory,
  label,
  overlays,
  onClose,
}: {
  path: string;
  directory: boolean;
  label: string;
  overlays(): { path: string; text: string }[];
  onClose(): void;
}) {
  const [mode, setMode] = useState<PdfExportOptions["mode"]>("combined");
  const [recursive, setRecursive] = useState(true);
  const [destination, setDestination] = useState<{
    id: string;
    path: string;
  } | null>(null);
  const [plan, setPlan] = useState<PdfExportPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [result, setResult] = useState<PdfExportResult | null>(null);
  const [progress, setProgress] = useState({
    completed: 0,
    total: 0,
    path: "",
  });
  const originalFocus = useRef(document.activeElement);
  useEffect(
    () => () => {
      const target = originalFocus.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    },
    [],
  );
  useEffect(() => window.margin.onPdfProgress(setProgress), []);
  useEffect(() => {
    let stale = false;
    setPlan(null);
    setError("");
    void window.margin
      .pdfPlan({ path, mode, recursive, destination: destination?.id })
      .then((value) => {
        if (!stale) setPlan(value);
      })
      .catch((error) => {
        if (!stale) setError(cleanError(error));
      });
    return () => {
      stale = true;
    };
  }, [path, mode, recursive, destination]);
  const locked = busy || choosing || !!result;
  async function runExport() {
    setBusy(true);
    setError("");
    setProgress({ completed: 0, total: plan?.outputs.length || 0, path: "" });
    try {
      setResult(
        await window.margin.pdfExport({
          path,
          mode,
          recursive,
          destination: destination?.id,
          overlays: overlays(),
        }),
      );
    } catch (error) {
      setError(cleanError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-scrim dialog-scrim"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (!busy && !choosing) onClose();
        }
      }}
    >
      <section
        className="action-dialog pdf-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Export to PDF"
      >
        <h2>Export to PDF</h2>
        <p className="pdf-source">{label}</p>
        {directory && (
          <label>
            PDF layout
            <select
              autoFocus
              aria-label="PDF layout"
              value={mode}
              disabled={locked}
              onChange={(event) =>
                setMode(event.target.value as PdfExportOptions["mode"])
              }
            >
              <option value="combined">One PDF for the entire folder</option>
              <option value="subfolders">One PDF per subfolder</option>
              <option value="files">One PDF per Markdown file</option>
            </select>
          </label>
        )}
        {directory && (
          <label className="pdf-checkbox">
            <input
              type="checkbox"
              checked={recursive}
              disabled={locked}
              onChange={(event) => setRecursive(event.target.checked)}
            />
            Include nested folders
          </label>
        )}
        {directory && mode === "subfolders" && (
          <p>
            {recursive
              ? "Each immediate subfolder becomes one PDF, including its nested notes. "
              : "Nested folders are excluded. "}
            Notes directly in the selected folder get a separate PDF named after
            that folder.
          </p>
        )}
        <label>Save location</label>
        <div className="pdf-destination">
          <span>
            {destination?.path || "Beside each source file or folder"}
          </span>
          <button
            autoFocus={!directory}
            disabled={locked}
            onClick={() => {
              setChoosing(true);
              void window.margin
                .pdfChooseDestination(path)
                .then((value) => {
                  if (value) setDestination(value);
                })
                .catch((error) => setError(cleanError(error)))
                .finally(() => setChoosing(false));
            }}
          >
            Choose folder…
          </button>
          {destination && (
            <button disabled={locked} onClick={() => setDestination(null)}>
              Reset
            </button>
          )}
        </div>
        {!result && (
          <>
            <p>
              Uses current editor contents, including unsaved edits. Existing
              PDFs are kept; new copies receive a number. Documents are ordered
              by path and each starts on a new page.
            </p>
            {plan ? (
              <div className="pdf-plan" aria-label="PDF export preview">
                <strong>
                  {plan.files} Markdown {plan.files === 1 ? "file" : "files"} →{" "}
                  {plan.outputs.length}{" "}
                  {plan.outputs.length === 1 ? "PDF" : "PDFs"}
                </strong>
                {plan.outputs.slice(0, 8).map((output) => (
                  <div key={output.path}>{output.path}</div>
                ))}
                {plan.outputs.length > 8 && (
                  <div>…and {plan.outputs.length - 8} more</div>
                )}
                {!plan.files && (
                  <p>No Markdown files found for these options.</p>
                )}
              </div>
            ) : (
              !error && <p role="status">Preparing export…</p>
            )}
          </>
        )}
        {busy && (
          <p role="status">
            Exporting PDF {Math.min(progress.completed + 1, progress.total)} of{" "}
            {progress.total}…
          </p>
        )}
        {result && (
          <div className="pdf-plan" role="status">
            <strong>
              {result.cancelled
                ? "Export cancelled."
                : result.failed.length
                  ? "Export finished with errors."
                  : "Export complete."}{" "}
              {result.paths.length}{" "}
              {result.paths.length === 1 ? "PDF saved" : "PDFs saved"}.
            </strong>
            {result.paths.map((output) => (
              <div key={output}>{output}</div>
            ))}
            {result.failed.map((failure) => (
              <p key={failure.path}>
                {failure.path}: {failure.message}
              </p>
            ))}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          {!result && (
            <button
              className="primary"
              disabled={busy || choosing || !plan?.files}
              onClick={() => void runExport()}
            >
              {busy ? "Exporting…" : "Export PDF"}
            </button>
          )}
          <button
            disabled={choosing}
            onClick={() => {
              if (busy)
                void window.margin
                  .pdfCancel()
                  .catch((error) => setError(cleanError(error)));
              else onClose();
            }}
          >
            {busy ? "Cancel export" : result ? "Done" : "Cancel"}
          </button>
        </div>
      </section>
    </div>
  );
}
