# Margin architecture

Margin is a local-first Windows and macOS desktop application. Ordinary UTF-8 files are the source of truth. No import, database conversion, remote service, account, or extension runtime is required.

## Technology choices

Electron provides consistent Chromium rendering, native dialogs, isolated IPC, system trash and native PTYs on both target platforms. Tauri was evaluated: its smaller runtime is attractive, but would require a separate Rust PTY integration and platform webview validation. Electron's established node-pty integration reduces that complexity. Renderer Node integration is disabled, context isolation and Chromium sandboxing are enabled. No document gets an executable Node context.

React + TypeScript + Vite implement the application shell. Tiptap 3 uses ProseMirror transactions, history and a real contenteditable document; its official Markdown extension provides GFM import/export. Milkdown and Toast UI were considered. Tiptap offers direct, well-defined commands for tables and formatting, and a maintainable extension model. Its Markdown extension is beta, so regression coverage and conservative source-mode protection matter. Unsupported constructs are opened in source mode to avoid destructive conversion. Frontmatter is retained verbatim. Unedited files are never serialized simply because they were opened.

CodeMirror 6 provides language parsing, syntax highlighting, folding, completion, search/replace and indentation. It is lighter and simpler to bundle than Monaco for a workspace that does not require VS Code extensions or a complete language-service environment. xterm.js is the terminal emulator, node-pty supplies ConPTY on Windows and forkpty on macOS/Linux. A terminal is created only following an explicit UI action.

The PTY dependency is pinned to `1.2.0-beta.18`. Testing exposed an exited-console `AttachConsole` race in stable 1.1.0; the pinned upstream release handles that failure. Windows closure explicitly terminates the shell's process tree, then releases ConPTY and its drain worker. Regression tests check actual process termination and that the test runner exits without leaked PTY workers. This pre-release dependency and Tiptap's beta Markdown extension are documented release risks, not hidden behind a claim of universal production readiness.

Primary sources: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Tiptap Markdown](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage), [CodeMirror language packages](https://codemirror.net/examples/lang-package/), [node-pty](https://github.com/microsoft/node-pty), [Tauri sidecars](https://v2.tauri.app/learn/sidecar-nodejs/).

## Boundaries

- `electron/workspace.mjs`: root confinement, UTF-8 reads, optimistic revision checks, atomic writes, file tree, attachments and operations.
- `electron/references.mjs`: remark GFM AST reference discovery; destination-only edits retain surrounding Markdown bytes. Link resolution accounts for anchors, URL encoding, folder moves and the source document's new directory.
- `electron/transactions.mjs`: durable operation journals and rollback/recovery. Originals are retained in application data before multi-file changes. Incomplete transactions block writes until recovered.
- `electron/main.mjs` and `preload.cjs`: allowlisted, sender-validated IPC, window lifecycle, settings/session drafts, watching, workspace-scoped asset protocol.
- `electron/terminals.mjs`: PTY creation, dimensions, output and termination.
- `src/editors`: rich Markdown and code editor integration; content is kept in tab buffers until explicit save or configured autosave.
- `src/lib/formatting.ts`, `formatter.worker.ts`, `formatter-client.ts`: bundled Prettier standalone and explicit parser plugins, run in a worker without privileged APIs or executable workspace configuration. Default-on formatting applies once on opening a clean supported source buffer. Requests carry a document snapshot; an intervening edit cancels the result. Formatting is one isolated undo step, uses the configured indentation/line endings and follows autosave. Parser failures leave original code intact. The PHP plugin is limited to pure PHP and a conservative syntax target; mixed PHP/HTML is not reformatted automatically.
- `src/App.tsx`: tabs, conflict handling, layout, command palette and workspace operations.

## Integrity policy

Every save compares a SHA-256 revision with disk and refuses to overwrite external changes. Mutations are serialized. Moves preflight every Markdown reference, check original revisions again, journal originals, rename without intentional overwrite and atomically rewrite affected documents. Rollback restores the original state on ordinary failure. Crash recovery checks observed state before restoring so that later external edits are never overwritten. Symbolic links are not traversed. Unsaved buffers must be saved before reorganization; conflicts must be explicitly resolved. Deleted entries go through the OS trash. Local draft recovery is independent of autosave.

The reference index is rebuilt from workspace Markdown at operation time to include external changes; this favors integrity over speed for typical personal workspaces. Ignored directories are excluded deliberately and surfaced in settings. Large repositories can incur a noticeable preflight delay. Full LSP servers, split editor groups, collaborative editing and an extension ecosystem are outside this version.
