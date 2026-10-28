import { useEffect, useRef, useState } from "react";
import { Play, RefreshCw, Square, X } from "lucide-react";
import { HtmlPreview } from "./HtmlPreview";

export const supportsLivePreview = (path: string) =>
  /\.(html?|php|phtml)$/i.test(path);

export function LivePreview({
  path,
  text,
  overlays,
  revision,
  visible,
  onLink,
  onClose,
}: {
  path: string;
  text: string;
  overlays: { path: string; text: string }[];
  revision: number;
  visible: boolean;
  onLink(href: string): void;
  onClose(): void;
}) {
  const php = /\.(php|phtml)$/i.test(path);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    path: string;
    html: string;
    status: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    setError("");
    setBusy(false);
    if (!php) {
      setRunning(false);
      void window.margin.phpPreviewStop();
    }
  }, [path, php]);
  useEffect(() => {
    const token = ++generation.current;
    if (!php || !running || !visible) return;
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const response = await window.margin.phpPreview({ path, overlays });
        if (generation.current === token) setResult({ ...response, path });
      } catch (error) {
        if (generation.current === token) {
          setError(
            (error as Error).message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            ),
          );
          setRunning(false);
        }
      } finally {
        if (generation.current === token) setBusy(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [php, running, visible, path, text, overlays, revision, refresh]);
  useEffect(
    () => () => {
      void window.margin.phpPreviewStop();
    },
    [],
  );
  return (
    <aside className="live-preview" aria-label="Live preview">
      <div className="live-preview-heading">
        <strong>{php ? "PHP" : "HTML"} result</strong>
        {php && (
          <button
            aria-label={running ? "Stop PHP preview" : "Start PHP preview"}
            onClick={() => {
              if (running) {
                generation.current++;
                setRunning(false);
                setBusy(false);
                void window.margin.phpPreviewStop();
              } else {
                setError("");
                setRunning(true);
              }
            }}
          >
            {running ? <Square size={14} /> : <Play size={14} />}
            {running ? "Stop" : "Start PHP"}
          </button>
        )}
        <button
          className="icon-button small"
          aria-label="Refresh live preview"
          disabled={php && !running}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="icon-button small"
          aria-label="Close live preview"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {php && (
        <div className="preview-status" role="status">
          {busy
            ? "Running PHP…"
            : running
              ? "PHP server running locally · Editor changes refresh automatically"
              : "Start PHP to run this project locally. PHP must be installed."}
        </div>
      )}
      {error && (
        <p className="preview-error" role="alert">
          {error}
        </p>
      )}
      {php && result?.path === path && result.status >= 400 && (
        <p className="preview-error" role="alert">
          PHP returned HTTP {result.status}. See the output below for details.
        </p>
      )}
      {(!php || result?.path === path) && (
        <HtmlPreview
          key={path}
          path={path}
          text={php ? result!.html : text}
          standalone
          overlays={overlays}
          revision={revision + refresh}
          onLink={onLink}
          onActivate={() => {}}
        />
      )}
    </aside>
  );
}
