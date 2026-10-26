# Margin

A local-first desktop Markdown workspace and lightweight IDE. Visual writing, ordinary files, source editing and real terminals share one calm interface.

## Run on Mac

- Apple Silicon installer: open `release/Margin-1.1.0-arm64.dmg` and drag **Margin** into **Applications**.
- Without installing: open `release/mac-arm64/Margin.app`.
- Choose **Open a folder**. For a tour, open `examples/Field Notes` and select `Start here.md`.

The local Mac build includes Node.js and Electron; no separate Node.js installation is needed to use it. It is ad-hoc signed for local use, without an Apple Developer ID or notarization. If macOS blocks opening a downloaded copy, allow Margin under **System Settings → Privacy & Security → Open Anyway**.

To rebuild locally on a Mac, use Node.js **24.19+** and npm **11+**:

```sh
npm ci
npm run dist:mac:local
```

This builds for the Mac's current architecture. The delivered build is **arm64 (Apple Silicon)**; Intel Macs need a separate x64 build. To run directly from source after `npm ci`, use `npm run build` followed by `npm start`, or use `npm run dev` for live reloading.

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
npm run test:e2e        # Real Electron workflow tests
npm run check          # All three checks above
npm run dist:win        # Windows x64 NSIS installer + unpacked application
npm run dist:mac        # Run on a Mac to produce a DMG
npm run dist:mac:local  # Ad-hoc signed DMG for local use without a certificate
npm run pack            # Unpacked build for the current platform
node scripts/icons.mjs # Regenerate PNG/ICO from the source SVG
```

Windows and Apple Silicon macOS packaging have been exercised. See [the functionality report](docs/FUNCTIONALITY.md) for the exact verification scope.

## Everyday use

- **Preferences → Spelling** turns spelling checks on or off and chooses Dutch, English (US/UK), French, German or the system language (English US fallback for unsupported system languages). Dictionaries are included and work offline on Windows and macOS. Visual Markdown checks all occurrences in headings, paragraphs, lists and tables; inline code and code blocks are skipped. Changing the language, editing, undoing or reloading rechecks the document without changing its contents or undo history. Spelling does not check grammar.
- Preferences has separate **Reading font size**, **Reading line height** and **Reading text width** for visual documents. These settings affect the view and persist across restart without rewriting notes.
- **Local version history** in the tab menu, command palette or tab-bar button shows earlier saved text with an aligned comparison. **Restore to editor** loads a selected version without changing the disk file until you save; the current editor contents are first kept as a recovery snapshot when history is enabled. History follows app-initiated file moves. Preferences sets retention per file and a shared storage limit across workspaces; disabling history stops new snapshots and keeps existing ones. This text history is separate from move-recovery journals and regular draft recovery.
- At the start of a visual paragraph or heading, type **/** to insert a heading, table, checklist, list, image, code block, quote or divider. Filter by typing, navigate with **Up/Down** and choose with **Enter**; **Escape** keeps the literal text. Code blocks and inline file paths do not trigger it. Cancelling the image chooser retains the slash query.
- Select multiple explorer items with **Cmd/Ctrl-click**, **Shift-click**, **Shift+Up/Down**, or **Cmd/Ctrl+A** for visible rows. Use the selection toolbar/menu to move or Trash them, or drag the selection onto a folder. Parent/child duplicates are collapsed, destinations are checked before a batch move, and Markdown references are rewritten together under one recovery journal. Trash warns about outside references and reports partial failures while retaining failed items. Selections are limited to 100 rows.
- **Split editor** opens a second document beside the current one; if needed it offers a file picker. File/tab menus also have **Open beside current**. Both documents keep their own editor mode, selection and scroll position, including after restart. The focused pane receives file/link navigation and global editor commands. Pane labels show the file paths; closing a pane or the split retains open tabs. The same file has one shared editor and is focused if already visible.
- **Quick Open** (**Cmd/Ctrl+P**) supports fuzzy filenames, recent files first with an empty query, and `filename:42` or `filename:42:5` to select a source line/column. Recent files persist per workspace.
- **Save as…** and **Save a copy…** are available in file-tab menus, the command palette and the native File menu. They save current editor contents, including unsaved edits, to a new workspace-relative path. Save as switches the tab to that path; Save a copy leaves the original tab active and dirty. Existing destinations are refused. Relative Markdown links keep their original targets when saving into another folder.
- Drag tabs to reorder, or use **Move tab left/right** in their menu. **Pin tab** keeps important tabs at the front and protects them from bulk closing; explicit Close still works. Order and pins survive restart. The active tab scrolls into view.
- The outline highlights the current section as you move the cursor or scroll. Use its search field to filter headings/symbols, retaining parent context; arrows collapse/expand nested sections.
- The visual editor's link window offers **Choose file or section**. Search a file, then choose the whole file or a Markdown heading; unsaved headings and duplicate-heading anchors are included. The original text selection is kept while choosing.
- In the explorer use **Up/Down**, **Home/End**, **Right** to expand/enter a folder and **Left** to collapse/return to its parent. Type a filename prefix to jump; repeated letters cycle matches. **Enter/Space** opens, **F2** renames, **Delete** opens Trash confirmation and **Shift+F10** opens the item menu.
- **Open terminal here** in an explorer item menu starts a shell in that folder, or a file's parent folder. Conflicts offer aligned editor/disk lines, change markers, line numbers and synchronized scrolling, with the existing copy/reload choices.
- Search file contents with **Cmd/Ctrl+Shift+F**. Results show paths, line numbers and snippets; filter by filename/glob (for example `*.md, src/**`), case or whole words. Searches include unsaved buffers and respect workspace ignores. Clicking a result opens Source with the exact match selected, preserving the file’s original formatting.
- Use **Cmd/Ctrl+F** for document search in Visual or Source. Visual search highlights matches across inline formatting, counts results and supports next/previous, case/whole-word filters and replacement. **Cmd+Alt+F** on Mac or **Ctrl+H** on Windows opens replacement; Replace all is one undo step.
- Use the tab-bar arrows or **Alt+Left/Right** to return to earlier files, search results and outline sections. Cursor, selection and reading position follow navigation, Visual/Source switches and workspace restoration after restart.
- Reopen the last closed tab with **Cmd/Ctrl+Shift+T**, the tab-bar button or the tab context menu. The menu also lists recent closed tabs. Up to 20 are remembered per workspace across restart; reopening a discarded edit loads the saved file.
- Open Markdown visually; use **Visual / Source** to edit the same underlying file. Formatting shortcuts, H1–H6, nested lists, interactive checklists, tables, links, images and highlighted code blocks are supported. The table toolbar adds/removes rows and columns. Click code blocks to set their language.
- HTML files (`.html` and `.htm`) open in **Source** by default. Switch to **Visual** to preview the current contents, including unsaved edits, with inline styles, stylesheets, images and fonts. Relative assets resolve from the HTML file's folder. The preview is read-only and scripts are disabled; edit in Source. Each tab remembers its selected mode across restart.
- Paste a screenshot with **Ctrl+V**, select an image with the toolbar, or drop raster images into a visual note. Preferences chooses a workspace attachment folder, a custom relative folder, or a folder beside the note. Images are ordinary files; base64 is not written by default.
- Open an image from the explorer to inspect it. Scroll up/down over the image to zoom around the pointer, drag to pan, and double-click or use **Fit to window** to reset. The toolbar includes zoom buttons and a percentage button for actual size. With the image viewport focused, use **+ / −**, **0** for fit, **1** for actual size and arrow keys to pan. Each open image tab retains its view while switching documents; zoom never changes the image file.
- Right-click explorer items for rename/move, duplicate and Trash. **F2** renames and **Delete** opens a Trash confirmation. Drag onto a folder or into the explorer's empty area to move. Move destinations are workspace-relative paths; their parent folders must already exist.
- Right-click text in either editor or an input field for undo/redo, clipboard actions, paste without formatting and select all. Source menus also offer find/replace, find selection, comment toggling and supported document formatting. In visual Markdown, right-click a link to open/copy/edit/remove it, or a table cell to insert/remove rows and columns or delete the table. Each structural table action has its own undo step.
- Right-click a file tab to save or close it, close other/right/all tabs, reveal it in the explorer or copy its absolute path. Actions target the clicked tab; bulk closing stops on cancellation or a failed save. Open menus with **Shift+F10** or the context-menu key, navigate with arrows/Home/End and Enter, and dismiss with Escape.
- Selected visual text has a **Format** submenu for bold, italic, strikethrough, inline code, links and clearing marks. Right-click code blocks to copy code, change language or delete the block; list items offer indent/outdent, list-type changes and checklist completion. Open submenus with Right Arrow and return with Left Arrow.
- Right-click inline images to copy their pixels or address, edit alternative text, open the image viewer or remove the reference from the document. Removing a reference preserves the image file. Local images open in a file tab; HTTPS images use a temporary viewer without creating attachments. Image-viewer menus offer fit/actual size/zoom, pixel/path copying and Finder/File Explorer reveal for local files.
- Explorer menus also offer folder creation, absolute-path copying and Finder/File Explorer reveal. Right-click empty explorer space to create documents or folders at the workspace root. Terminal menus offer selection copying, clipboard paste, select all and clearing the view; clicked web links offer open/address copying. Clearing the view leaves the running shell alive.
- Right-click a Markdown heading in Visual/Source or the outline for **Copy section link** and **Copy section title**. Section links are ready-to-paste Markdown links with workspace-root paths, so they work from other notes. Repeated headings receive distinct anchors; titles retain their full readable text even when the outline label is shortened. Ctrl/⌘-click follows section links in both editor modes, including unsaved headings.
- Moves update standard Markdown links, images and reference definitions across included notes, including outgoing links in moved notes. Save your open edits before reorganizing. Perform reorganizations through Margin to retain this behavior.
- Ctrl-click (⌘-click on Mac) a document link to follow it. **Ctrl+K** edits a visual hyperlink. **Ctrl+P** opens files; **Ctrl+Shift+P** opens the command palette.
- Source files use CodeMirror: syntax colors, folding, indentation, bracket/quote closing, search/replace (**Ctrl+F** or **Ctrl+H**), comment toggling (**Ctrl+/**), and available language completions (**Ctrl+Space**). JSON has parser diagnostics with gutter markers. Other languages do not have project-wide language servers.
- **Automatically format code on open** is enabled by default under **Preferences → Appearance & editing**. It pretty-prints HTML (including CSS/JS inside it), CSS/SCSS/Less, JS/TS, JSON/JSONC/JSON5, YAML, Vue, GraphQL, XML and pure PHP using the selected 2/4/8-space indentation. Formatting is one undoable editor change and follows the normal autosave policy. Switch the option off to retain original formatting on open. The **Format document** button, command palette entry and **Shift+Alt+F** apply formatting manually. Invalid code, mixed PHP/HTML and unsupported languages such as Python, shell, SQL and C# are left unchanged. Formatting runs in an isolated worker and never loads a workspace's executable formatter configuration. Files above 2 MB are left unchanged by the formatter.
- **Ctrl+`** shows/hides the terminal. Use **+** to explicitly launch a shell, its tab to switch, and **×** to terminate it. Shells start in the workspace directory. On Windows, installed PowerShell, PowerShell 7, Command Prompt and Git Bash are offered. On Mac, installed login shells are offered. Running terminals remain alive while switching documents or hiding the panel; app shutdown terminates them.
- Drag separators or focus them and use arrow keys to resize. Layout and theme persist. Focus mode hides the explorer and terminal. The **Document outline** button at the right of the tab bar navigates Markdown headings in visual and source modes, HTML/XML elements (with IDs/classes and heading text), PHP namespaces/classes/traits/interfaces/enums/functions/methods, JavaScript/TypeScript declarations and named arrow functions, CSS/SCSS/Less selectors, Python classes/functions and Vue template/script/style sections. Mixed PHP/HTML shows both structures. It updates as you type; source navigation targets the exact symbol position. Outline parsing is limited to 2 MB and the first 500 items; unsupported file types show an explanatory message.
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
