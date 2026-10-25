import { useEffect, useState } from "react";
import { ConflictDiff } from "./ConflictDiff";
import type { MarginAPI } from "../types";
export function HistoryDialog({
  path,
  text,
  onRestore,
  onClose,
  onError,
}: {
  path: string;
  text: string;
  onRestore(text: string): Promise<void>;
  onClose(): void;
  onError(error: unknown): void;
}) {
  const [versions, setVersions] = useState<
      Awaited<ReturnType<MarginAPI["historyList"]>>
    >([]),
    [id, setId] = useState(""),
    [preview, setPreview] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [restoring, setRestoring] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let stale = false;
    void window.margin
      .historyList(path)
      .then((list) => {
        if (!stale) {
          setVersions(list);
          setId(list[0]?.id || "");
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
  }, [path]);
  useEffect(() => {
    let stale = false;
    setPreview(null);
    if (id)
      void window.margin
        .historyRead(path, id)
        .then((text) => {
          if (!stale) setPreview(text);
        })
        .catch((error) => {
          if (!stale) setError(error.message);
        });
    return () => {
      stale = true;
    };
  }, [path, id]);
  return (
    <div
      className="modal-scrim"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (!restoring) onClose();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !restoring) onClose();
      }}
    >
      <section
        className="action-dialog wide history-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Local version history"
      >
        <h2>Local version history</h2>
        <p>
          {path} · Earlier saved contents stay on this device. Restore loads the
          selected version into your editor; Save writes it to disk. Current
          editor contents are kept as a history snapshot before restoring when
          history is enabled.
        </p>
        <label>
          Saved version
          <select
            autoFocus
            aria-label="Saved version"
            value={id}
            disabled={restoring}
            onChange={(event) => {
              setId(event.target.value);
              setError("");
            }}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {new Date(version.created).toLocaleString()} · {version.reason}{" "}
                · {version.bytes} bytes
              </option>
            ))}
          </select>
        </label>
        {loading ? (
          <p role="status">Loading versions…</p>
        ) : (
          !versions.length && (
            <p>
              No earlier saved versions yet. Versions are kept when a save
              replaces different file contents.
            </p>
          )
        )}
        {error && <p role="alert">{error}</p>}
        {preview !== null && (
          <ConflictDiff
            mine={text}
            disk={preview}
            leftTitle="Current editor contents"
            rightTitle="Selected saved version"
          />
        )}
        <div className="dialog-actions">
          <button
            disabled={restoring || preview === null}
            className="primary"
            onClick={() => {
              if (preview === null) return;
              setRestoring(true);
              void onRestore(preview).catch((error) => {
                onError(error);
                setRestoring(false);
              });
            }}
          >
            Restore to editor
          </button>
          <button disabled={restoring} onClick={onClose}>
            Close history
          </button>
        </div>
      </section>
    </div>
  );
}
