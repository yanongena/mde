import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { HtmlPreview } from "./HtmlPreview";

export const supportsLivePreview = (path: string) =>
  /\.(html?|php|phtml)$/i.test(path);

function PhpContextDialog({
  path,
  initial,
  onStart,
  onClose,
}: {
  path: string;
  initial: string;
  onStart(context: string): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [context, setContext] = useState(initial);
  const folders = [""];
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index++)
    folders.push(parts.slice(0, index).join("/"));
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="action-dialog php-context-dialog"
      aria-labelledby="php-context-title"
      onCancel={onClose}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onStart(context);
        }}
      >
        <h2 id="php-context-title">PHP context</h2>
        <p>
          Choose the project folder for this preview. Include any folders needed
          by your PHP files. Only this folder is copied and served (up to 64
          MB).
        </p>
        <label>
          Project folder
          <select
            autoFocus
            aria-label="PHP context folder"
            value={context}
            onChange={(event) => setContext(event.target.value)}
          >
            {folders.reverse().map((folder) => (
              <option key={folder} value={folder}>
                {folder || "Workspace root"}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Start PHP
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function LivePreview({
  path,
  text,
  overlays,
  revision,
  visible,
  codeHidden,
  onToggleCode,
  onLink,
  onClose,
}: {
  path: string;
  text: string;
  overlays: { path: string; text: string }[];
  revision: number;
  visible: boolean;
  codeHidden: boolean;
  onToggleCode(): void;
  onLink(href: string): void;
  onClose(): void;
}) {
  const php = /\.(php|phtml)$/i.test(path);
  const [running, setRunning] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const [choosingContext, setChoosingContext] = useState(false);
  const startButton = useRef<HTMLButtonElement>(null);
  const closeContext = () => {
    setChoosingContext(false);
    requestAnimationFrame(() => startButton.current?.focus());
  };
  const [result, setResult] = useState<{
    path: string;
    html: string;
    url: string;
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
        const response = await window.margin.phpPreview({
          path,
          overlays,
          context: context ?? "",
        });
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
          void window.margin.phpPreviewStop();
        }
      } finally {
        if (generation.current === token) setBusy(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [php, running, visible, path, text, overlays, context, revision, refresh]);
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
        <button
          className="icon-button small"
          aria-label={codeHidden ? "Show code" : "Hide code"}
          aria-pressed={codeHidden}
          onClick={onToggleCode}
        >
          {codeHidden ? (
            <PanelLeftOpen size={14} />
          ) : (
            <PanelLeftClose size={14} />
          )}
        </button>
        {php && (
          <button
            ref={startButton}
            aria-label={running ? "Stop PHP preview" : "Start PHP preview"}
            onClick={() => {
              if (running) {
                generation.current++;
                setRunning(false);
                setBusy(false);
                void window.margin.phpPreviewStop();
              } else {
                setChoosingContext(true);
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
        {php && (
          <button
            className="icon-button small"
            aria-label="Open PHP preview in browser"
            disabled={!running || busy || result?.path !== path}
            onClick={() => {
              if (result?.path === path && running)
                void window.margin
                  .external(result.url)
                  .catch((error: Error) => setError(error.message));
            }}
          >
            <ExternalLink size={14} />
          </button>
        )}
        <button
          className="icon-button small"
          aria-label="Close live preview"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {php && (busy || !running) && (
        <div className="preview-status" role="status">
          {busy
            ? "Running PHP…"
            : error
              ? "PHP preview stopped. See the error below."
              : "Start PHP to choose a project folder and run it locally. PHP must be installed."}
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
          hideToolbar={php}
          overlays={overlays}
          revision={revision + refresh}
          onLink={onLink}
          onActivate={() => {}}
        />
      )}
      {php && choosingContext && (
        <PhpContextDialog
          key={`php-context:${path}`}
          path={path}
          initial={
            context !== null && (!context || path.startsWith(context + "/"))
              ? context
              : path.split("/").slice(0, -1).join("/")
          }
          onClose={closeContext}
          onStart={(folder) => {
            setResult(null);
            setContext(folder);
            closeContext();
            setError("");
            setRunning(true);
          }}
        />
      )}
    </aside>
  );
}
