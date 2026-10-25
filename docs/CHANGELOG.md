# Changelog

## 1.1.0 — 25 October 2026

- Added **Automatically format code on open**, enabled by default and persisted in Preferences. Existing installations receive the default automatically.
- Added **Format document**, the matching command-palette entry and **Shift+Alt+F**.
- Uses selected 2/4/8-space indentation; formats embedded CSS and JavaScript in HTML. JSON objects are expanded for readability. Source line endings are retained.
- Formatting is one undoable edit and follows the configured autosave policy. Unsupported or invalid files are left unchanged; dirty recovered drafts are not autoformatted.
- Formatting runs in a worker with bundled parsers, without reading executable workspace formatter configurations. A pending result cannot overwrite intervening typing or external changes.
- Corrected code-editor line-number alignment.
- Verified with 21 Node tests and 14 source-application workflows; the four formatting workflows also passed against the packaged Windows executable.
