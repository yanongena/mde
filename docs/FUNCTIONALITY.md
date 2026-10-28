# Functionality report

## Teaching update — 28 October 2026 (local source)

Presentation mode uses F8, a separate persisted font profile, larger code/reading text, a stronger cursor and reduced workspace chrome. It follows the ordinary theme by default, with optional persisted light/dark overrides. The previous persisted light default is migrated once to follow the workspace. Leaving it restores ordinary preferences. A Markdown or PDF assignment can be pinned on the left; new file navigation uses the right pane regardless of which pane was focused. Pins follow app-initiated moves, survive code-tab closure and restore with the workspace.

Live HTML/HTM and PHP/PHTML results appear beside the source, optionally as a third pane beside the assignment. Their divider supports dragging across the preview, keyboard resizing and double-click reset to equal widths; the bounded 20–80% ratio is remembered per workspace. Resizing code/result leaves the assignment width intact. HTML includes unsaved stylesheet buffers. The preview target is restored even when a CSS file is active. PHP starts explicitly using an installed CLI and a loopback server over a temporary project copy, including unsaved buffers and PHP includes. Stop interrupts active/queued requests; closing the preview, changing workspaces or normal application closure disposes the process and copy. PHP execution is not resumed after restarting.

Results use the existing script-disabled HTML rendering, with no interactive form submissions or browser sessions. PHP executes with the user's normal account permissions. Copies respect workspace ignores and exclude symlinks; projects are limited to 10,000 files/64 MB, responses to 5 MB and requests to 10 seconds. Dependencies in ignored directories are not copied.

Verified on macOS source: production build, all 88 Node tests (including four PHP preview tests using real PHP), all four new Teaching workflows, 15 adjacent preview/layout/UX workflows, three smoke workflows and two terminal/closure workflows. Presentation and three-pane screenshots were reviewed. See `docs/TESTING.md` for exact commands. Existing packaged applications and installers are unchanged. The historical reports below describe earlier versions.

Verification date: 25 October 2026. Hosts: Windows 11 x64 (original verification) and macOS 27.0.1 arm64 (local Mac build).

## PDF export update — 26 October 2026

Markdown file/tab menus, folder/root explorer menus, the command palette and the native File menu offer PDF export. Folder layouts combine all included notes, combine each immediate subfolder's descendants (with direct notes in their own folder-named PDF), or produce one PDF per Markdown file. Nested folders can be excluded. Default PDFs sit beside their source file/folder, including beside the workspace root for a whole-workspace export. A system-picked output directory is optional; individual-file exports preserve relative subdirectories there. A preview lists output paths and counts. Existing PDFs are never replaced: both planning and exclusive creation allocate numbered filenames.

Export snapshots current editor buffers without saving the Markdown. A4 rendering includes GFM tables/tasks, fenced code, sanitized HTML, local images and HTTPS images, with page numbers and a new page for each combined source. YAML frontmatter is omitted. Missing or unsupported images report the affected PDF as failed; completed outputs are retained on partial failure or cancellation. Printing runs in a hidden, sandboxed Electron window, excludes document scripts and checks local images through workspace path/symlink validation. Individual local images are limited to 20 MB and each PDF render times out after 60 seconds. Workspace moves/saves queue behind an export; switching workspaces requires finishing or cancelling it.

Verified in source: production build, all **77 Node tests** and both new Electron export workflows. The full **81-workflow** Electron regression run passed 80 workflows initially; the remaining source-drop redo test used a Windows-only redo shortcut on macOS. Correcting that test to Cmd+Shift+Z and waiting for the restored link made the targeted rerun pass, together with both PDF workflows. No editor behavior was changed for that correction. PDF visual review and text extraction verified Unicode, the euro symbol, tables, checkboxes, local SVG, code, page numbering and unsaved text. The Mac application and DMG are rebuilt for this update; Windows artifacts are unchanged.

Both PDF export workflows also passed against the rebuilt packaged Apple Silicon Mac app. App signature and DMG integrity verification passed, and `release/SHA256SUMS-mac.txt` contains the refreshed installer checksum.

## PDF viewer update — 26 October 2026

PDF files now open inside ordinary read-only tabs, including through Markdown links, Quick Open and split view. The bundled PDF.js viewer provides continuous scrolling, previous/next and direct page navigation, bounded zoom, fit-to-width, selectable text and text search with highlighted results. Cmd/Ctrl+F focuses PDF search. Page, zoom and scroll position use the existing per-tab/session history and survive restarting. PDF changes on disk reload the viewer; invalid or missing files report an inline error. Password-protected PDFs prompt for their password. Local files are limited to 100 MB, read as binary through validated workspace paths, and excluded from source editing, Save As, version history and text-format status indicators. Scanned pages need a text layer for searching; OCR and PDF editing are not included.

The viewer, worker, character maps, standard fonts, image decoders and annotation icons are bundled for offline use in development and packaged builds. PDF scripts are not enabled; clicked HTTP(S) web links use the existing external-link handler and document links cannot replace the app. Rendering is deferred for unopened background tabs and viewer observers/workers are disposed on close.

Verified: production build and all **79 Node tests**, including binary PDF reading, traversal/symlink/size validation, file classification and session state validation. Both new source Electron viewer workflows passed, covering actual canvas/text rendering, navigation, zoom, Cmd/Ctrl+F, highlighted text search, tab switching, saved session restoration, unchanged PDF bytes, invalid-file errors and automatic reload. The development-server workflow also opens an exported PDF and checks its rendered text, exercising the worker and asset paths under Vite.

The full **83-workflow source Electron regression suite passed** after the viewer integration, including the existing export, editor, image, file-move, terminal, history, session and split-view workflows.

The rebuilt Apple Silicon Mac app passed all four PDF viewer/export workflows. Its ad-hoc signature and DMG integrity checks passed, and the installer checksum was refreshed. Windows binaries are unchanged.

The PDF toolbar now uses larger bordered controls with visible **Zoom out**, **Zoom in** and **Fit width** labels. Clicking the percentage resets zoom to 100%. The production build and both source viewer workflows passed, including explicit 100% → 80% → 100% zoom checks. The rebuilt Mac app passed the navigation/search/zoom/session workflow; signature and DMG verification passed and its checksum was refreshed.

## Image preview update

Standalone image tabs support scroll-wheel/trackpad zoom centered at the pointer, drag-to-pan, toolbar zoom/actual-size/fit controls, double-click fit and keyboard controls. Zoom is bounded at 1600%, with a lower bound of 5% or the fit scale when smaller. Fitted images adapt to viewport resizing. Each mounted tab retains its own zoom/pan when switching documents; views reset after closing/reopening the tab or restarting. Image viewing never rewrites the image file.

The production build and two new Electron image-preview workflows passed on macOS. They exercise actual mouse wheel and drag input, pointer anchoring, prevention of whole-app zoom, fit reset, keyboard zoom, zoom bounds, per-tab state, viewport resizing and unchanged saved image bytes. The same two tests passed against the rebuilt Apple Silicon Mac application; ad-hoc signature and DMG integrity checks passed and its installer checksum was refreshed.

## Document outline update (local source)

The outline now supports Markdown, HTML/HTM, PHP/PHTML, JS/TS (including JSX/TSX file declarations), CSS/SCSS/Less, XML/SVG, Vue and Python. HTML/XML entries identify nested elements with IDs/classes; HTML headings include their text. PHP declarations and mixed HTML share one ordered outline. Embedded JavaScript/CSS in HTML and Vue are included. Markdown frontmatter and fenced examples are excluded, and Setext/duplicate headings are handled.

The outline updates from the current editor buffer, including unsaved edits and automatic formatting. Source entries navigate to exact offsets; visual Markdown entries navigate by heading order. Parsing uses the bundled language parsers without running document code. Files above 2 MB show a message; lists are capped at 500 items. Other file types show an unsupported message. This is syntactic navigation; it does not add LSP semantic analysis or a full symbol index.

The local macOS source passed the production build, all **28 Node tests** (including seven outline tests), and **two new Electron outline workflows**, covering code languages, mixed PHP/HTML, edits, cursor placement, automatic formatting, file switching, Markdown navigation and unsupported files. The same two outline workflows also passed against the rebuilt Apple Silicon Mac application. Its ad-hoc signature and DMG integrity checks passed; `release/SHA256SUMS-mac.txt` records the updated installer checksum. The historical verification below predates this update.

## Verified in the source application

The Margin 1.1 full test run passed **21 Node tests** (including real filesystem, formatting and PTY integration) and **14 real Electron workflow tests**. Production renderer compilation and TypeScript checks passed. Light visual authoring, dark terminals and formatted HTML screenshots were captured during automated interaction.

| Capability | Evidence / verified behavior |
| --- | --- |
| Local workspaces | Existing nested folders open in the real explorer; no import or proprietary document format |
| File operations | Create, duplicate, rename, move, explorer drag/drop and OS Trash; collision/traversal/reserved-name refusal |
| Visual Markdown | H1–H6, paragraphs, bold, italic, strike, inline code, unordered/ordered/nested lists, interactive tasks, quotes, links, images, tables, rules and highlighted fenced code |
| Persistence | Save/reopen, three repeated source/visual toggles, checkbox undo/redo and frontmatter/BOM/CRLF coverage |
| Images | Native clipboard PNG paste saved to disk and rendered; chosen and dropped images; root/nearby/custom-relative storage, unique names |
| Reference integrity | Images, individual notes and whole folders renamed/moved; incoming links in unopened notes and outgoing relative links in moved notes; anchors and encoded spaces retained |
| Recovery | Injected move failure rolls back; interrupted-journal recovery; later external edits block unsafe recovery; unsaved drafts recover after forced exit |
| Code | Real syntax highlighting for Python, JS, TS, HTML, CSS, PHP, JSON, YAML, shell, SQL, C# and XML; source edits saved; search/replace panel; JSON gutter diagnostics |
| Automatic code formatting | Enabled by default; chosen 2/4/8-space indentation; HTML plus embedded CSS/JS; JS/TS, JSON, YAML, XML and pure PHP parser coverage; one-step undo/redo; persisted preference; manual button, shortcut and command; invalid input preserved; concurrent typing never overwritten |
| Terminals | Real PowerShell command output and filesystem effects; multiple instances; persistent shell variables; resize; hide/show/switch; process termination on tab/application close |
| Layout | Explorer/terminal resize with keyboard-accessible separators; theme, active tabs and panel sizes restored after restart |
| Workflow | Quick file opening, command palette, toolbar formatting, rich HTML clipboard paste, link following, close cancel/keep-draft prompts |
| External changes | Clean buffers reload; dirty buffers retain editor text; side-by-side conflict comparison and recovered-copy save |
| Isolation | Renderer has no Node `require`/`process`; traversal requests fail; script markup is never executed; HTML code fences remain literal |
| Development mode | Real Vite/Electron development server launch tested separately from the production renderer |

## Production artifacts

The Windows x64 unpacked application and NSIS installer were generated successfully. The final rebuild uses the final source and custom application icon. Artifact checksums are in `release/SHA256SUMS.txt`.

**The Margin 1.1 packaged Windows executable passed the four formatting workflow tests**, covering default-on behavior, indentation, undo/redo, save/reopen, preference persistence, manual commands, invalid input, concurrent typing and JSON/YAML/PHP/XML browser workers. The complete fourteen-workflow suite ran against the source application on Windows. Native Windows installer installation/uninstallation remains unverified. Native computer-control was stopped with Escape during the original session; subsequent application tests use Playwright's Electron debugging transport.

## Apple Silicon Mac build

`npm run dist:mac:local` produced `release/Margin-1.1.0-arm64.dmg` and `release/mac-arm64/Margin.app` on macOS 27.0.1 arm64 with Node 24.19.0 and Electron 45.0.0. This local build uses ad-hoc signing with hardened runtime disabled; it has no Apple Developer ID or notarization. `codesign --verify --deep --strict` passed for the app and `hdiutil verify` passed for the DMG. Its SHA-256 checksum is in `release/SHA256SUMS-mac.txt`.

The TypeScript/production build and all **21 Node tests** passed on Mac. The final packaged Mac executable passed **nine Electron workflow tests**: all twelve source languages and external changes; real login-shell terminals and layout/session restoration; autosave and forced-exit draft recovery; close prompts, draft preservation and shell termination; renderer isolation and diagnostics; and all four formatting workflows. The close test now accounts for macOS keeping the app running after its last window closes, and checks shell termination before explicitly exiting the app.

The five other Electron workflows (development server, visual authoring, clipboard/image moves, rich-text authoring and image chooser/explorer operations) were not rerun on Mac. Intel builds, drag-to-Applications installation and downloaded-file Gatekeeper acceptance were not tested. The app declares macOS 13.0 as its minimum; runtime verification was on macOS 27.0.1 only.

## Limits and partially implemented areas

- macOS Apple Silicon packaging and the nine workflows above were tested locally. Intel macOS, public signing/notarization and the remaining five workflows need separate verification.
- Markdown visual editing normalizes supported syntax. It is not byte-for-byte lossless after edits. Opening an unedited file does not rewrite it. Frontmatter is retained verbatim. Unsupported HTML, reference-definition/footnote documents, wiki links, math and custom directives use source mode to protect content.
- Basic GFM tables are supported. Merged cells, persistent image dimensions and arbitrary rich formatting inside table cells are outside the Markdown format supported here. Images are constrained to the document width; there are no stored drag-resize dimensions.
- CodeMirror provides syntax, structural editor features, available language completions and JSON parser diagnostics. **No LSP/project-wide semantic diagnostics, debugger or VS Code extension host.**
- Default-on code formatting uses bundled Prettier parsers in an unprivileged worker. HTML/HTM/Vue, CSS/SCSS/Less, JS/TS, JSON/JSONC/JSON5, YAML, GraphQL, XML and pure PHP are supported. Python, shell, SQL, C#, mixed PHP/HTML, invalid syntax and files above 2 MB are left unchanged. Formatting is an undoable edit and can be saved by the normal autosave policy. Disable the option to retain source files unchanged on open. Existing dirty recovery drafts are not automatically reformatted.
- One workspace per window, with an optional two-document split and a visual slash-insertion menu. Quick file search, workspace content search, formatting controls and the command palette are implemented.
- Ignore entries are exact names and exclude reference updates in those directories. External file-manager moves cannot safely infer every intended rename and do not rewrite references. Standard Markdown links/images/definitions are managed; wiki/HTML references are not.
- Files are UTF-8, up to 10 MB; image imports up to 30 MB; included trees up to 100,000 entries. Symlink directories are excluded. Full workspace scanning before a move favors correctness over speed in very large repositories.
- Attachments can use arbitrary relative folders **inside** the workspace. Absolute external attachment libraries and SVG clipboard imports are not supported.
- Terminal processes survive document switches and panel hiding, then terminate when closed or when the application exits. **Running processes are not resumed after an application restart.** Shell command history follows the chosen shell's own history support. Normal PowerShell behavior was exercised; every possible full-screen terminal program was not tested.
- Recovery drafts have a 350 ms debounce. Move journals retain original note content and are not automatically pruned. Multi-file operations are journaled and recoverable, not a filesystem-wide atomic transaction. Simultaneous writes from unrelated external tools still require care; optimistic revision checking is not a cross-process locking protocol.
- The Windows installer is unsigned. OS installation/uninstallation, public code signing, long-duration soak testing, assistive-technology audits and hardware power-loss testing remain release-validation work.

The automated evidence supports the Windows workflows and the Mac verification scope above. It does not establish that every possible Markdown dialect, shell, filesystem, OS configuration or long-running workload is production-proven.

## P1 quality-of-life update

Workspace content search includes unsaved buffers, snippets, include/exclude globs, case/whole-word filters and exact selected Source results. Visual Markdown has find/replace across marks, match highlighting/counts, next/previous and one-step Replace-all undo. Back/Forward checkpoints file/section positions, branches correctly and follows renamed paths. Selection and reading position transfer between Visual/Source and restore after restart. Closed tabs reopen with their mode/position, and the recent list persists without discarded drafts.

Workspace search displays at most 500 matches and skips ignored, binary, unreadable or oversized files. Visual find displays at most 2000 matches and asks users to refine before Replace all at that cap. Navigation history is limited to 100 locations in memory; recent closed tabs retain 20 metadata entries per workspace. Changed external content may require approximate/clamped position restoration. The Mac build is refreshed for this update; Windows binaries are unchanged.

Verified: production build, 44 Node tests, 43 source Electron workflows and 26 workflows against the rebuilt packaged Apple Silicon Mac app. The packaged checks cover all nine new QoL workflows plus the existing context menus and outline. Ad-hoc signature and DMG integrity verification passed; the installer checksum was refreshed.

## P2 quality-of-life update

Implemented all eight proposed P2 workflows: fuzzy/recent Quick Open with line/column navigation; Save as/Save a copy of unsaved editor contents; outline tracking/filter/collapse; draggable and pinned tabs; workspace-file/Markdown-heading link picking; explorer keyboard traversal/typeahead; terminal cwd from the selected folder/file; and highlighted aligned conflict review with synchronized scrolling.

Save destinations must be new workspace-relative files in existing parent folders. Save as keeps the original disk file; Save a copy keeps the original dirty tab. Relative Markdown targets are rebased across directories. Pins survive restart, remain at the front and are protected from bulk closing; explicit closing remains available. The outline and link picker include dirty text; link heading parsing has the shared two-MB limit. Conflict previews show up to 5000 aligned rows from the first 5001 lines per side, with a bounded comparison algorithm and an explicit notice when capped. Complete buffers remain available to existing save/recovery actions. The Windows binary is not rebuilt in this update.

Verified: 48 Node tests and 51 source Electron workflows passed; the packaged Mac app passed all 50 non-development workflows. The eight P2 QoL workflows were rerun successfully against the final rebuilt app after the long-line scrolling adjustment. Final app signature and DMG integrity checks passed, and the installer checksum was refreshed.

## P3 quality-of-life update

Implemented all five proposed P3 features: independent visual reading settings; local earlier-version comparison/restoration with configurable retention; keyboard slash insertion; explorer multi-selection with grouped moves/Trash and existing reference integrity; and two independently scrollable/editable document panes with session restoration.

History captures earlier text when a successful Margin save replaces different contents, including autosave. Default retention is 20 versions per file and 100 MB of snapshot text across workspaces, with an additional 5000-snapshot index cap. Lowering limits prunes versions; disabling history stops new snapshots while retaining existing ones within the configured limits. Snapshots remain in local application data and follow app-initiated moves. Restoring loads a buffer first; Save is a separate action. Move-recovery journals and normal recovery drafts have separate retention and do not count toward the history text budget. Images/binary files have no text version history.

Multi-selection handles up to 100 visible items and collapses selected parents/children before operations. Batch moves preflight destinations and use one recovery journal; later external edits pause automatic rollback rather than being overwritten. Native Trash operations can partially fail: successful removals and failed paths are reported separately, with no silent removal of failed items. Slash insertion triggers at a paragraph/heading start; Escape keeps text, image chooser cancellation does not remove the query, and code/inline paths are excluded.

Split view supports two distinct documents using one editor per open file, with shared dirty state and independent modes/cursor/scroll. Opening an already-visible file focuses it. Navigation to another file replaces the focused pane. Pane paths and view states restore after restart, and app moves/Save As update them. The split uses equal-width panes; no additional editor groups are provided. Closing a pane retains its tab. The Mac build is refreshed for this update; the Windows binary is unchanged.

Verified: production build, 54 Node tests and all 59 source Electron workflows passed. Final preference/explorer refinements passed eleven targeted source workflows, and the rebuilt packaged Apple Silicon Mac app passed all 58 non-development workflows. Final ad-hoc signature and DMG integrity checks passed; the installer checksum was refreshed.
