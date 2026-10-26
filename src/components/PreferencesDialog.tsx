import { useRef, useState } from "react";
import { ArrowUpRight, BookOpen, RotateCcw, Search, X } from "lucide-react";
import type { Settings, SpellcheckInfo } from "../types";
import { preferenceCategories } from "../lib/preferences";
const spellingLanguageName = (code: string) =>
  code === "nl"
    ? "Nederlands · Dutch"
    : new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;

export function PreferencesDialog({
  settings,
  spellcheck,
  recovery,
  keyboard,
  updateSettings,
  onIgnoredChange,
  onReset,
  onClose,
}: {
  settings: Settings;
  spellcheck: SpellcheckInfo | null;
  recovery: { file: string; message: string }[];
  keyboard: string;
  updateSettings(
    patch: Partial<Settings>,
    optimistic?: boolean,
  ): Promise<boolean>;
  onIgnoredChange(ignored: string[]): Promise<void>;
  onReset(categories: string[]): Promise<void>;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const content = useRef<HTMLDivElement>(null);
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = new Set(
    preferenceCategories
      .filter(
        (item) =>
          (category === "all" || category === item.id) &&
          terms.every((term) =>
            (item.title + " " + item.keywords).toLowerCase().includes(term),
          ),
      )
      .map((item) => item.id),
  );
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Preferences"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">MAKE YOURSELF AT HOME</span>
            <h2>Preferences</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close preferences"
            onClick={() => onClose()}
          >
            <X />
          </button>
        </div>
        <div className="settings-tools">
          <label className="preferences-search">
            <Search size={16} />
            <input
              autoFocus
              aria-label="Search preferences"
              placeholder="Search preferences…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCategory("all");
              }}
            />
            {query && (
              <button
                className="icon-button small"
                aria-label="Clear preferences search"
                onClick={() => setQuery("")}
              >
                <X />
              </button>
            )}
          </label>
          <p>
            Changes apply immediately. Text fields apply when you leave the
            field or press Enter.
          </p>
        </div>
        <nav
          className="settings-categories"
          aria-label="Preferences categories"
        >
          {[{ id: "all", title: "All settings" }, ...preferenceCategories].map(
            (item) => (
              <button
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  setQuery("");
                  content.current?.scrollTo(0, 0);
                }}
              >
                {item.title}
              </button>
            ),
          )}
        </nav>
        <div className="settings-content" ref={content}>
          {!visible.size && (
            <p className="settings-empty" role="status">
              No preferences match “{query}”. Try another search or clear the
              search.
            </p>
          )}
          <div className="settings-section" hidden={!visible.has("editing")}>
            <h3>Appearance & editing</h3>
            <label>
              Automatically format code on open
              <input
                type="checkbox"
                aria-label="Automatically format code on open"
                checked={settings.formatOnOpen}
                onChange={(event) => {
                  const formatOnOpen = event.target.checked;
                  void updateSettings({ formatOnOpen }, true);
                }}
              />
            </label>
            <p>
              Format supported code with your indentation setting when opening
              it. Formatting is undoable and follows your autosave policy.
              Unsupported or invalid code is kept unchanged.
            </p>
            <label>
              Color theme
              <select
                value={settings.theme}
                onChange={(e) =>
                  void updateSettings({
                    theme: e.target.value as Settings["theme"],
                  })
                }
              >
                <option value="light">Daylight · light</option>
                <option value="dark">Nightfall · dark</option>
              </select>
            </label>
            <label>
              Code font size
              <select
                value={settings.fontSize}
                onChange={(e) =>
                  void updateSettings({ fontSize: Number(e.target.value) })
                }
              >
                {[12, 13, 14, 15, 16, 18, 20, 24].map((n) => (
                  <option key={n} value={n}>
                    {n} px
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reading font size
              <select
                aria-label="Reading font size"
                value={settings.readingFontSize}
                onChange={(event) =>
                  void updateSettings({
                    readingFontSize: Number(event.target.value),
                  })
                }
              >
                {[14, 15, 16, 17, 18, 20, 22, 24, 28, 32].map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reading line height
              <select
                aria-label="Reading line height"
                value={settings.readingLineHeight}
                onChange={(event) =>
                  void updateSettings({
                    readingLineHeight: Number(event.target.value),
                  })
                }
              >
                {[1.3, 1.5, 1.65, 1.85, 2, 2.25, 2.5].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reading text width
              <select
                aria-label="Reading text width"
                value={settings.readingWidth}
                onChange={(event) =>
                  void updateSettings({
                    readingWidth: Number(event.target.value),
                  })
                }
              >
                {[560, 680, 820, 960, 1100, 1200].map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
            <label>
              Indentation
              <select
                aria-label="Indentation"
                value={settings.indentSize}
                onChange={(e) =>
                  void updateSettings({
                    indentSize: Number(e.target.value),
                  })
                }
              >
                {[2, 4, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} spaces
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="settings-section" hidden={!visible.has("spelling")}>
            <h3>Spelling</h3>
            <label>
              Check spelling in visual Markdown
              <input
                type="checkbox"
                aria-label="Check spelling"
                checked={settings.spellcheckEnabled}
                onChange={(event) =>
                  void updateSettings(
                    {
                      spellcheckEnabled: event.target.checked,
                    },
                    true,
                  )
                }
              />
            </label>
            <label>
              Spellcheck language
              <select
                aria-label="Spellcheck language"
                value={settings.spellcheckLanguage}
                disabled={!settings.spellcheckEnabled || !spellcheck}
                onChange={(event) =>
                  void updateSettings({
                    spellcheckLanguage: event.target.value,
                  })
                }
              >
                <option value="system">
                  System language
                  {spellcheck
                    ? ` · ${spellingLanguageName(spellcheck.systemLanguage)}`
                    : ""}
                </option>
                {[...(spellcheck?.languages || [])]
                  .sort((a, b) =>
                    spellingLanguageName(a).localeCompare(
                      spellingLanguageName(b),
                    ),
                  )
                  .map((code) => (
                    <option key={code} value={code}>
                      {spellingLanguageName(code)}
                    </option>
                  ))}
              </select>
            </label>
            <p>
              Check all text in visual Markdown, including headings, lists and
              tables. Inline code and code blocks are skipped. Changes apply
              immediately. Dutch, English (US/UK), French and German
              dictionaries are included. Checks run locally and work offline.
            </p>
            {settings.spellcheckEnabled && spellcheck?.status !== "ready" && (
              <p role="status">
                {spellcheck?.status === "error"
                  ? "The spelling dictionary could not be loaded. Turn spelling off and on to retry."
                  : "Loading the spelling dictionary… Text will be checked automatically when it is ready."}
              </p>
            )}
          </div>
          <div className="settings-section" hidden={!visible.has("saving")}>
            <h3>Saving & recovery</h3>
            <label className="checkbox-setting">
              <input
                type="checkbox"
                aria-label="Keep local version history"
                checked={settings.historyEnabled}
                onChange={(event) =>
                  void updateSettings({
                    historyEnabled: event.target.checked,
                  })
                }
              />
              Keep local version history
            </label>
            <label>
              History storage limit
              <select
                aria-label="History storage limit"
                value={settings.historyLimitMB}
                onChange={(event) =>
                  void updateSettings({
                    historyLimitMB: Number(event.target.value),
                  })
                }
              >
                {[10, 25, 50, 100, 250, 500, 1000].map((size) => (
                  <option key={size} value={size}>
                    {size} MB
                  </option>
                ))}
              </select>
            </label>
            <label>
              Versions per file
              <select
                aria-label="Versions per file"
                value={settings.historyVersions}
                onChange={(event) =>
                  void updateSettings({
                    historyVersions: Number(event.target.value),
                  })
                }
              >
                {[5, 10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Earlier saved text stays in local application data. Limits apply
              across workspaces. Lowering a limit removes the oldest versions;
              disabling history stops new snapshots and retains existing
              versions.
            </p>
            <label>
              Autosave policy
              <select
                aria-label="Autosave policy"
                value={settings.autosave}
                onChange={(e) =>
                  void updateSettings({
                    autosave: e.target.value as Settings["autosave"],
                  })
                }
              >
                <option value="afterDelay">After a pause</option>
                <option value="onBlur">When window loses focus</option>
                <option value="off">Manual save</option>
              </select>
            </label>
            <label>
              Autosave delay
              <select
                value={settings.autosaveDelay}
                onChange={(e) =>
                  void updateSettings({
                    autosaveDelay: Number(e.target.value),
                  })
                }
              >
                {[500, 1000, 1500, 3000, 5000, 10000].map((n) => (
                  <option key={n} value={n}>
                    {n / 1000} seconds
                  </option>
                ))}
              </select>
            </label>
            <p>
              Recovery drafts are saved separately from your files. External
              modifications are never silently overwritten.
            </p>
            <button
              className="text-button"
              onClick={() => void window.margin.openRecovery()}
            >
              Open file-operation recovery folder <ArrowUpRight size={14} />
            </button>
            {recovery.map((r) => (
              <p className="danger-text" key={r.file}>
                {r.file}
                <br />
                {r.message}
              </p>
            ))}
          </div>
          <div
            className="settings-section"
            hidden={!visible.has("attachments")}
          >
            <h3>Images & attachments</h3>
            <label>
              Storage location
              <select
                aria-label="Attachment location"
                value={settings.attachmentMode}
                onChange={(e) =>
                  void updateSettings({
                    attachmentMode: e.target
                      .value as Settings["attachmentMode"],
                  })
                }
              >
                <option value="workspace">Relative to workspace root</option>
                <option value="nearby">Relative to the Markdown file</option>
              </select>
            </label>
            <label>
              Folder path
              <input
                aria-label="Attachment folder"
                key={settings.attachmentFolder}
                defaultValue={settings.attachmentFolder}
                placeholder="assets"
                onBlur={(e) => {
                  if (e.target.value !== settings.attachmentFolder)
                    void updateSettings({
                      attachmentFolder: e.target.value,
                    });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </label>
            <p>
              Paste screenshots with {keyboard}+V, use the image button, or drop
              images into a visual document. PNG, JPEG, GIF and WebP images are
              saved as ordinary files with portable relative paths.
            </p>
          </div>
          <div className="settings-section" hidden={!visible.has("filtering")}>
            <h3>Workspace filtering</h3>
            <label className="stacked">
              Ignored folder and file names
              <input
                aria-label="Ignored directories"
                key={settings.ignored.join(", ")}
                defaultValue={settings.ignored.join(", ")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const ignored = e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean);
                  if (
                    JSON.stringify(ignored) !== JSON.stringify(settings.ignored)
                  )
                    void onIgnoredChange(ignored);
                }}
              />
            </label>
            <p>
              Comma-separated exact names. These directories are excluded from
              the explorer, watcher, and reference updates. Links inside
              excluded notes are not managed. The .git directory is always
              excluded.
            </p>
          </div>
          <div className="settings-about" hidden={!!query}>
            <BookOpen size={24} />
            <div>
              <strong>Margin 1.1</strong>
              <span>A workspace for words and work.</span>
            </div>
          </div>
        </div>
        <footer className="settings-footer">
          <span role="status">
            {query
              ? `${visible.size} matching categories`
              : category === "all"
                ? "All preferences"
                : preferenceCategories.find((item) => item.id === category)
                    ?.title}
          </span>
          <button
            disabled={!visible.size}
            onClick={() => void onReset([...visible])}
          >
            <RotateCcw size={14} />
            {category === "all" && !query
              ? "Restore all defaults…"
              : query
                ? "Restore matching defaults…"
                : "Restore category defaults…"}
          </button>
        </footer>
      </div>
    </div>
  );
}
