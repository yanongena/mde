# Testing Margin

## Commands

```sh
npm ci
npm run build
npm test
npm run test:e2e
```

`npm run check` runs the last three commands. There are 54 Node regression/integration tests and 59 Electron workflow tests. Tests use fresh temporary workspace folders and fresh application-data directories. They never operate on the user's ordinary notes. The E2E clipboard tests change the system clipboard. The native image-picker dialog, file-manager reveal, external link launches and HTTPS fixture responses are substituted where needed; clipboard operations, attachment writes, editor changes and PTY execution are real. The other workflow tests drive real Electron controls through Playwright.

`npm test` includes a real PTY shell test. It writes commands, verifies computed output and shell state, resizes the terminal and checks process termination. `npm run test:e2e` launches visible application windows. Allow it to finish before using the test application's controls. It uses Electron's debugging transport rather than coordinate scripts. Browser downloads are unnecessary: the Electron package supplies Chromium.

## Coverage

- The two `HTML visual mode` Electron workflows cover Source as the default for `.html`/`.htm`, previews of unsaved contents, relative CSS/SVG assets, inline styles, fragment and workspace links, script/refresh isolation, keyboard save/find, outline navigation into Source, unchanged source bytes, external file updates, and mode/scroll restoration after restart. Run with `npm run test:e2e -- --grep 'HTML visual mode'`. `test-results/html-preview.png` records the rendered preview.

- Four `P3` Electron workflows verify heading menus in Visual/Source/outline, keyboard access and focus, identical encoded links, full long titles, rich clipboard paste and duplicate-heading navigation across notes in both modes, protected Setext documents, unsaved headings, fenced-code exclusions and unchanged bytes when copying. The source regression checks CRLF formatting/undo/redo; cross-note navigation also uses BOM/CRLF/frontmatter offsets. All four passed against both source and rebuilt packaged Apple Silicon Mac applications; all fifteen P1/P2/P3 menu workflows passed together on that build.
- `sections.test.mjs`: readable inline text, full untruncated titles, Unicode/duplicate/numbered-anchor collisions (including 10,000 repeated headings), BOM/CRLF/frontmatter/Setext/fence ranges and escaped Markdown links resolving encoded filenames from another folder.

- Six `P2 menus` Electron workflows cover selected-text submenus through mouse/keyboard, code-block language/history, clicked list/checklist actions, inline-image pixels/alt/view/removal with unchanged image bytes, standalone-image Markdown roundtrips, PNG/JPEG/WebP/GIF/AVIF pixel copying, HTTPS previews without attachments, viewer zoom/path/reveal, explorer folder/root creation and confined IPC, plus real terminal paste/selection/clear/link actions. `test-results/p2-format-menu.png` records the Format submenu. HTTPS image responses and native reveal/external launches use fixtures; copying and decoding the pixels uses the real Electron clipboard. All six passed against both the source application and the rebuilt packaged Apple Silicon Mac application; all eleven P1/P2 menu workflows passed together on that build.
- `terminal-links.test.mjs`: URL punctuation/neighbor hit testing, soft wraps, wide cells, surrogate characters, hard-line boundaries and refusal of partial scrollback URLs.

- Five `context menus` Electron workflows verify real clipboard copy/cut/paste and plain-text paste, selection/history/focus retention, keyboard opening and navigation, source search/replace/comments/formatting, disabled unsupported actions, clicked-cell table edits with independent undo and saved Markdown, clicked-link open/copy/edit/remove, and inactive-tab save/path/reveal plus batch-close cancellation and failed saves during external conflicts. All five passed against both the source application and the rebuilt packaged Apple Silicon Mac executable. The compact-window check verifies menu bounds and scrolling. Run with `npm run test:e2e -- --grep "context menus"`. `test-results/table-context-menu.png` records the table menu.

- The two `image preview` Electron workflows exercise real mouse-wheel zoom, pointer anchoring, prevention of whole-app zoom, drag panning, double-click/keyboard/toolbar controls, zoom limits, fit-on-resize, per-tab state and unchanged original image bytes. Run with `npm run test:e2e -- --grep 'image preview'`. Both passed on the local macOS source application and the rebuilt packaged Apple Silicon Mac executable. `test-results/image-zoom.png` records the image viewer.

- `outline.test.mjs`: HTML element hierarchy, IDs/classes, embedded JS/CSS, mixed PHP/HTML offsets, PHP declarations, TS declarations/arrows, Vue/SCSS/XML/Python, CRLF/BOM/frontmatter, fenced examples, Setext/duplicate headings, unsupported/empty/oversized files and truncation.
- The two `document outline` Electron workflows verify source cursor placement by typing and checking saved bytes, unsaved edits, file switching, autoformatted code, the supported language families, visual/source Markdown navigation and unsupported files. Run with `npm run test:e2e -- --grep 'document outline'`. Both passed against the local macOS source application and the rebuilt packaged Apple Silicon Mac executable. `test-results/code-outline.png` records mixed PHP/HTML navigation.

- `references.test.mjs`: destination-only rewrites; titles; anchors; queries; spaces/Unicode; percent encoding; root, self and relative links; reference definitions; nested folder moves; code/frontmatter preservation.
- `workspace.test.mjs`: real tree/create/save/duplicate; optimistic conflicts; image/note/folder moves; unopened incoming links; injected failure rollback; collisions; traversal; reserved names; symlink exclusion; attachment modes and unique names; startup journal recovery and later external edits; BOM/CRLF; non-UTF-8/binary refusal.
- `terminals.test.mjs`: actual PTY commands, persistent shell variables, multiple shells, dimensions and termination.
- `formatting.test.mjs`: real HTML/embedded CSS/JS formatting, idempotence, indentation, CRLF, cursor position, JSON semantic preservation, JS/TS/CSS/YAML/XML/PHP parsers, invalid syntax and unsupported/mixed-language refusal.
- `e2e/workspace.spec.mjs`: development launch; graphical authoring; tables and checkboxes; repeated mode switching/save/reopen; native image clipboard; image rename/move and inline rendering; all twelve required source languages; code editing/search/conflicts; PowerShell commands with filesystem effects; terminal switching; layout/session persistence; forced-exit draft recovery; autosave/quick open; heading levels and formatting; nested lists; hyperlinks and rich-text paste; chosen/dropped images; explorer drag/drop, duplicate and OS Trash; close cancel/draft retention and process cleanup; renderer confinement, JSON diagnostics and literal HTML code fences.

The workflow assertions inspect saved bytes on disk as well as rendered controls. Terminal tests assert calculated output and a file created by the shell, so echoed command strings cannot satisfy them.

The formatting workflows additionally verify the default-on setting, four-space indentation, single-step undo/redo, saved output, preference persistence after restart, manual shortcut/command, invalid-code preservation and concurrent typing during worker execution. JSON/YAML/XML/PHP are exercised in the actual sandboxed browser worker. `test-results/code-formatting.png` records the formatted HTML editor.

The compact-editor workflow checks that the editor starts directly below the tab bar, save and Markdown mode controls remain available, and tooltips appear within 800 ms (configured delay: 200 ms). It also checks keyboard focus, Escape dismissal, hoverable tooltips, full file paths, accessible descriptions and viewport bounds. `test-results/compact-editor.png` records the compact HTML editor in dark mode.

## Packaged binary check

After `npm run dist:win`, the same E2E suite can target the packaged application:

```powershell
$env:MARGIN_TEST_EXECUTABLE = (Resolve-Path 'release/win-unpacked/Margin.exe').Path
npm run test:e2e
Remove-Item Env:MARGIN_TEST_EXECUTABLE
```

For Margin 1.1, the four formatting workflows were run successfully against `release/win-unpacked/Margin.exe` using this override and a `--grep` filter. The full fourteen-workflow run was against the source application. Package generation alone is not a runtime verification. Native installer installation/uninstallation is a separate OS-level acceptance check.

On an Apple Silicon Mac, build and test the local packaged application with:

```sh
npm run dist:mac:local
MARGIN_TEST_EXECUTABLE="$PWD/release/mac-arm64/Margin.app/Contents/MacOS/Margin" npm run test:e2e -- --grep 'all requested code|PowerShell PTYs|autosave, quick open|native close prompts|renderer isolation|code auto-format|formatting preference|format worker|browser worker'
```

These nine workflows passed against the ad-hoc signed Mac build. The terminal test's historical PowerShell title also covers the real macOS login shell. The close test waits for the window to close on macOS, verifies terminal termination while the app remains alive, and explicitly exits the app before checking draft recovery after restart.

## Visual review

The suite records `test-results/visual-authoring.png` and `test-results/dark-terminal.png`; the HTML report lives in `playwright-report/`. Failure traces are retained. A native desktop-control inspection was also attempted in this session, then stopped by the user's physical Escape key. No further native desktop input was sent after that stop.

## Platform status

The original delivery was tested on Windows 11 x64, Node 24.19 and Electron 45. The local Mac build was subsequently tested on macOS 27.0.1 arm64 with Node 24.19.0 and Electron 45: all 21 Node tests and the nine packaged workflows above passed. Mac CI should run the complete suite and sign/notarize a DMG before a public Mac release. The Mac artifact is ad-hoc signed for local use; Windows artifacts are unsigned. Public distribution needs a trusted signing certificate. Fault injection verifies ordinary rollback and conservative journal recovery, not hardware-level durability under every power-loss/filesystem failure.

## P1 QoL verification

The added Node suites cover literal/Unicode matching, real filesystem search, filters, ignored/symlink/binary files, dirty and empty buffer overlays, UTF-16/BOM/CRLF offsets, cancellation, caps, Markdown/visual selection projections, navigation branching/path updates and bounded persisted snapshots.

Nine additional real Electron workflows verify workspace result filtering/selection, dirty buffer search, source-byte preservation with automatic formatting enabled, visual search across marks/code, case/whole-word filters, replacement advancement, single-step undo, Back/Forward and branching, outline navigation, mode switching, source and visual restart restoration, cancelled close, discarded-draft exclusion and one-tab-per-shortcut reopening. Tests inspect actual saved bytes and persisted session data. Screenshots: `test-results/qol-workspace-search.png` and `test-results/qol-visual-find.png`.

Verification on 25 October 2026: production TypeScript/Vite build, all 44 Node tests and all 43 source Electron workflows passed. The rebuilt Apple Silicon Mac app passed 26 workflows selected with `--grep 'QoL |context menus|P2 menus|P3 |document outline'`, including the extended source-byte/selection restoration check after restart. `codesign --verify --deep --strict` and `hdiutil verify` passed. The DMG and its block map were regenerated, and `release/SHA256SUMS-mac.txt` was refreshed.

## P2 QoL verification

Four additional Node tests cover fuzzy filename/recent ranking, line/column parsing and CRLF offsets, aligned line diff numbering and gaps, bounded large-file previews, and real filesystem snapshot-copy writes. Copy checks include dirty text, BOM/CRLF, relative links across folders, unchanged originals, exclusive concurrent creation, collisions, traversal, symlinks and size limits.

Eight additional Electron workflows exercise fuzzy Quick Open with line/column edits and recent-file restart persistence; dirty Save Copy and Save As, rebased links, collision refusal and unchanged original files; outline caret/scroll tracking, ancestor filtering and collapsing in both modes; real tab dragging, keyboard reordering, persistent pins, protected bulk close and active-tab visibility in an overflowing bar; the link picker with dirty duplicate headings, encoded filenames and selected formatted text; explorer roving arrows/Home/End/parent/typeahead/context menus; a real shell writing into the selected subdirectory plus rejected traversal; and highlighted/gap-aligned conflict rows with synchronized vertical scroll, independently readable long lines and both original buffers preserved. Screenshots: `test-results/p2-qol-outline.png`, `test-results/p2-qol-link-picker.png` and `test-results/p2-qol-conflicts.png`.

Verification on 25 October 2026: production build, all 48 Node tests and all 51 source Electron workflows passed. The packaged Apple Silicon application passed all 50 non-development workflows (`--grep-invert 'development server'`). After the final independent-horizontal-scrolling adjustment, the Mac app/DMG were rebuilt and all eight P2 QoL workflows passed again, including long-line reading and synchronized vertical scroll. Ad-hoc signature verification and DMG integrity verification passed on the final artifacts; the installer SHA-256 was refreshed in `release/SHA256SUMS-mac.txt`.

## P3 QoL verification

Six added Node tests exercise actual history saves and optimistic conflicts, BOM/CRLF snapshots, restore checkpoints, workspace/path isolation, tamper detection, retention/size limits, disabled recording, orphan cleanup and move/restart metadata; selection root normalization; grouped reference rewriting between moved notes; all-or-nothing collision preflight (including names differing only in case); injected failure rollback; partial batch-journal startup recovery; and preservation of later external edits.

Eight added Electron workflows exercise persisted reading settings without file edits; history comparison/restore with dirty checkpoints and moved paths; keyboard slash navigation/filter/undo and code exclusion; native image chooser cancellation with real attachment insertion; multi-select move/cancel with updated incoming and mutual links; Shift-selection and group Trash confirmation/partial failure; mixed Visual/Source split editing, independent scroll and restart restoration; and focused-pane file routing with renamed references. Native chooser and partial Trash results use controlled fixtures, while filesystem writes, editor commands, sessions and history storage remain real. Screenshots: `test-results/p3-history.png`, `test-results/p3-split.png` and `test-results/p3-slash-menu.png`.

Source verification on 25 October 2026: production TypeScript/Vite build, all 54 Node tests and all 59 source Electron workflows passed. The regression run also verifies explorer reveal selects its target under multi-selection and bidirectional comparison scrolling ignores programmatic echoes. File-creation assertions wait for actual disk presence rather than assuming IPC completion timing.

The final preference/explorer refinements passed eleven targeted source workflows: concurrent reading/history preference updates, formatting preference persistence, inactive-tab menus, root explorer creation, and all eight P3 workflows. Preference writes are serialized through completion of retention pruning; explicitly focusing the explorer container keeps keyboard context menus scoped to empty/root space.

Final packaged verification on 25 October 2026: the rebuilt Apple Silicon Mac app passed all 58 non-development Electron workflows with `MARGIN_TEST_EXECUTABLE` targeting `release/mac-arm64/Margin.app/Contents/MacOS/Margin` and `--grep-invert 'development server'`. This includes all eight P3 workflows, concurrent preference updates and root explorer keyboard menus. `codesign --verify --deep --strict` and `hdiutil verify` passed on the final app/DMG. The DMG/block map and `release/SHA256SUMS-mac.txt` were refreshed.
