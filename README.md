# Margin

A local-first desktop Markdown workspace and lightweight IDE. Visual writing, ordinary files, source editing and real terminals share one calm interface.

## Run on Windows

- Installer: `release/Margin Setup 1.1.0.exe`.
- Without installing: launch `release/win-unpacked/Margin.exe`. Keep its adjacent files and folders together.
- Choose **Open a folder**. For a tour, open `examples/Field Notes` and select `Start here.md`.

The Windows build is unsigned. It was built on Windows 11 x64. Windows 10 1809 or newer is required for ConPTY terminals. No Node.js installation is needed to use the packaged application.

## Develop

Use Node.js **24.19+** and npm **11+**. A network connection is needed for the initial dependency/Electron downloads.

```sh
npm ci
npm run dev
```

The Vite server listens on `127.0.0.1:5173`. `npm run dev` launches Electron and stops the server when the app exits. Normal renderer changes reload automatically; restart the command after changing Electron files. The lockfile records exact dependency versions. Native PTY prebuilds are included for Windows x64/arm64 and macOS Intel/Apple Silicon. Building from source instead requires the platform's C++ toolchain.

```sh
npm run build          # TypeScript check + production renderer
npm start              # Run that production renderer in Electron
npm test               # Filesystem, references, recovery and real PTY tests
npm run test:e2e        # Ten real Electron workflow tests
npm run check          # All three checks above
npm run dist:win        # Windows x64 NSIS installer + unpacked application
npm run dist:mac        # Run on a Mac to produce a DMG
npm run pack            # Unpacked build for the current platform
node scripts/icons.mjs # Regenerate PNG/ICO from the source SVG
```

Windows packaging was exercised here. macOS source/build configuration is provided, but no macOS runtime or DMG was verified on this Windows host. See [the functionality report](docs/FUNCTIONALITY.md) for the exact verification scope.

## Everyday use

- Open Markdown visually; use **Visual / Source** to edit the same underlying file. Formatting shortcuts, H1–H6, nested lists, interactive checklists, tables, links, images and highlighted code blocks are supported. The table toolbar adds/removes rows and columns. Click code blocks to set their language.
- Paste a screenshot with **Ctrl+V**, select an image with the toolbar, or drop raster images into a visual note. Preferences chooses a workspace attachment folder, a custom relative folder, or a folder beside the note. Images are ordinary files; base64 is not written by default.
- Right-click explorer items for rename/move, duplicate and Trash. **F2** renames and **Delete** opens a Trash confirmation. Drag onto a folder or into the explorer's empty area to move. Move destinations are workspace-relative paths; their parent folders must already exist.
- Moves update standard Markdown links, images and reference definitions across included notes, including outgoing links in moved notes. Save your open edits before reorganizing. Perform reorganizations through Margin to retain this behavior.
- Ctrl-click (⌘-click on Mac) a document link to follow it. **Ctrl+K** edits a visual hyperlink. **Ctrl+P** opens files; **Ctrl+Shift+P** opens the command palette.
- Source files use CodeMirror: syntax colors, folding, indentation, bracket/quote closing, search/replace (**Ctrl+F** or **Ctrl+H**), comment toggling (**Ctrl+/**), and available language completions (**Ctrl+Space**). JSON has parser diagnostics with gutter markers. Other languages do not have project-wide language servers.
- **Automatically format code on open** is enabled by default under **Preferences → Appearance & editing**. It pretty-prints HTML (including CSS/JS inside it), CSS/SCSS/Less, JS/TS, JSON/JSONC/JSON5, YAML, Vue, GraphQL, XML and pure PHP using the selected 2/4/8-space indentation. Formatting is one undoable editor change and follows the normal autosave policy. Switch the option off to retain original formatting on open. The **Format document** button, command palette entry and **Shift+Alt+F** apply formatting manually. Invalid code, mixed PHP/HTML and unsupported languages such as Python, shell, SQL and C# are left unchanged. Formatting runs in an isolated worker and never loads a workspace's executable formatter configuration. Files above 2 MB are left unchanged by the formatter.
- **Ctrl+`** shows/hides the terminal. Use **+** to explicitly launch a shell, its tab to switch, and **×** to terminate it. Shells start in the workspace directory. On Windows, installed PowerShell, PowerShell 7, Command Prompt and Git Bash are offered. On Mac, installed login shells are offered. Running terminals remain alive while switching documents or hiding the panel; app shutdown terminates them.
- Drag separators or focus them and use arrow keys to resize. Layout and theme persist. Focus mode hides the explorer and terminal. The outline navigates headings in visual and source modes.
- **Ctrl+N** creates a document, **Ctrl+S** saves, **Ctrl+Shift+S** saves all, **Ctrl+W** closes a tab, **Ctrl+Tab** switches tabs, **Ctrl+,** opens preferences. Use **⌘** in place of Ctrl on macOS.

## Saving and recovery

Autosave is configurable: after a pause, on window focus loss, or manual. Open tabs, layout and recovery drafts persist separately from workspace files. Markdown files are not rewritten just because you opened them. Supported source files receive an undoable formatting edit when **Automatically format code on open** is enabled; autosave can save that edit. Disable this option to retain source files unchanged when opening. Frontmatter, UTF-8 BOMs and line-ending preference are retained. Visual edits normalize supported Markdown formatting; source mode otherwise preserves exact text.

Saves compare a SHA-256 disk revision before writing. Clean tabs reload when files change outside the application. Dirty tabs retain your text and present a conflict comparison: save your version as a separate recovered copy, or explicitly reload disk. Closing a dirty application offers **Save all**, **Keep drafts**, or **Cancel**. These are local recovery mechanisms, not a substitute for backups/version control. Drafts are persisted after a 350 ms pause; abrupt power loss can lose the most recent fraction of a second.

File moves journal original affected documents in application data before making changes. Ordinary failures roll back. Startup attempts conservative recovery after an interrupted operation. If later external edits make recovery ambiguous, writes are blocked and Preferences links to the recovery folder. Keep both locations and the journal; resolve manually and restart. Completed journals retain pre-move originals until you remove them. They contain note content and may consume disk space.

Default application data is under Electron's user-data directory (`%APPDATA%/Margin` for the Windows packaged build; `~/Library/Application Support/Margin` on Mac). Development builds may use `margin-workspace` instead. `state.json` contains settings, workspace sessions and local drafts; `recovery/` contains operation journals. The test-only/environment overrides `MARGIN_DATA_PATH` and `MARGIN_WORKSPACE` isolate test data from your ordinary sessions.

## Interoperability boundaries

HTML, wiki links, footnotes/reference-definition documents, math and custom directives use protected source mode rather than an incomplete rich conversion. Reference definitions are still maintained by file moves. HTML inside fenced code is safely displayed as code. Local image previews support raster formats; SVG and executable documents are not rendered with privileges. External HTTPS images can load from their URLs.

Ignored names apply to the explorer, watcher **and reference scanning**. Notes inside ignored folders do not have their links updated. Symbolic links are not followed. Editing is limited to UTF-8 files up to 10 MB and image import to 30 MB; the tree is capped at 100,000 included entries. External file-manager moves are detected, but automatic reference rewriting applies only to operations initiated in Margin.

For implementation details see [architecture](docs/ARCHITECTURE.md), [testing](docs/TESTING.md), and [verified functionality and limits](docs/FUNCTIONALITY.md).
