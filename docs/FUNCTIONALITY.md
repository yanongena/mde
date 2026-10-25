# Functionality report

Verification date: 25 October 2026. Host: Windows 11 x64.

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

**The Margin 1.1 packaged Windows executable passed the four formatting workflow tests**, covering default-on behavior, indentation, undo/redo, save/reopen, preference persistence, manual commands, invalid input, concurrent typing and JSON/YAML/PHP/XML browser workers. The complete fourteen-workflow suite ran against the source application. Native installer installation/uninstallation and macOS runtime remain unverified. Native computer-control was stopped with Escape during the original session; subsequent application tests use Playwright's Electron debugging transport.

## Limits and partially implemented areas

- macOS is implemented at the source/configuration level; **not tested on a Mac**, and no Mac artifact was produced on this Windows host. It is not claimed as a verified Mac release.
- Markdown visual editing normalizes supported syntax. It is not byte-for-byte lossless after edits. Opening an unedited file does not rewrite it. Frontmatter is retained verbatim. Unsupported HTML, reference-definition/footnote documents, wiki links, math and custom directives use source mode to protect content.
- Basic GFM tables are supported. Merged cells, persistent image dimensions and arbitrary rich formatting inside table cells are outside the Markdown format supported here. Images are constrained to the document width; there are no stored drag-resize dimensions.
- CodeMirror provides syntax, structural editor features, available language completions and JSON parser diagnostics. **No LSP/project-wide semantic diagnostics, debugger or VS Code extension host.**
- Default-on code formatting uses bundled Prettier parsers in an unprivileged worker. HTML/HTM/Vue, CSS/SCSS/Less, JS/TS, JSON/JSONC/JSON5, YAML, GraphQL, XML and pure PHP are supported. Python, shell, SQL, C#, mixed PHP/HTML, invalid syntax and files above 2 MB are left unchanged. Formatting is an undoable edit and can be saved by the normal autosave policy. Disable the option to retain source files unchanged on open. Existing dirty recovery drafts are not automatically reformatted.
- One editor group, one workspace per window; no split editors, workspace-wide content search or slash-insertion palette. Quick file search, formatting controls and the command palette are implemented.
- Ignore entries are exact names and exclude reference updates in those directories. External file-manager moves cannot safely infer every intended rename and do not rewrite references. Standard Markdown links/images/definitions are managed; wiki/HTML references are not.
- Files are UTF-8, up to 10 MB; image imports up to 30 MB; included trees up to 100,000 entries. Symlink directories are excluded. Full workspace scanning before a move favors correctness over speed in very large repositories.
- Attachments can use arbitrary relative folders **inside** the workspace. Absolute external attachment libraries and SVG clipboard imports are not supported.
- Terminal processes survive document switches and panel hiding, then terminate when closed or when the application exits. **Running processes are not resumed after an application restart.** Shell command history follows the chosen shell's own history support. Normal PowerShell behavior was exercised; every possible full-screen terminal program was not tested.
- Recovery drafts have a 350 ms debounce. Move journals retain original note content and are not automatically pruned. Multi-file operations are journaled and recoverable, not a filesystem-wide atomic transaction. Simultaneous writes from unrelated external tools still require care; optimistic revision checking is not a cross-process locking protocol.
- The Windows installer is unsigned. OS installation/uninstallation, public code signing, long-duration soak testing, assistive-technology audits and hardware power-loss testing remain release-validation work.

The automated evidence supports the implemented Windows workflows. It does not establish that every possible Markdown dialect, shell, filesystem, OS configuration or long-running workload is production-proven.
