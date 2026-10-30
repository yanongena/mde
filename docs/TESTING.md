# Testing Margin

## Commands

```sh
npm ci
npm run check                 # Build + all Node tests; no application windows
npm run test:e2e:smoke        # Three core Electron workflows, hidden
npm run test:e2e -- --grep 'PDF' # Only workflows for the changed feature, hidden
npm run check:full            # Explicit full regression: build + Node + all Electron
npm run test:e2e:headed -- --grep 'PDF' # Visible windows for interactive debugging
```

`npm run check` is the normal broad local check. It deliberately excludes Electron workflows. `npm run check:full` preserves the complete regression check for releases and broad changes. `npm run test:e2e` still runs every Electron workflow when explicitly requested; add `--grep` to select a feature. Use `npm run test:e2e -- --list` to inspect available workflows without launching the application. Build before running source Electron tests so they use the current renderer.

Tests use fresh temporary workspace folders and fresh application-data directories. They never operate on the user's ordinary notes. The E2E clipboard tests change the system clipboard. The native image-picker dialog, file-manager reveal, external link launches and HTTPS fixture responses are substituted where needed; clipboard operations, attachment writes, editor changes and PTY execution are real. The other workflow tests drive real Electron controls through Playwright.

`npm test` includes a real PTY shell test. It writes commands, verifies computed output and shell state, resizes the terminal and checks process termination, without opening a terminal window.

## Choosing tests during development

- For a small logic change, run the relevant Node files directly, for example `node --test tests/pdf-export.test.mjs tests/pdf-files.test.mjs`. Include adjacent behavior when shared code changes.
- For production TypeScript, renderer, asset, or Electron/renderer integration changes, also run `npm run build`. Use `npm run check` when a broader windowless check is useful.
- For UI changes, add only the affected Electron workflows with `--grep`. For example, PDF changes use `--grep 'PDF'`; outline changes use `--grep 'document outline|P2 QoL outline'`; moving notes also needs reference, session, and split-pane coverage where affected.
- For shared UI changes, `npm run test:e2e:smoke` selects three existing workflows tagged `@smoke`: visual authoring/serialization, code editing/search/external changes, and autosave/draft recovery across restart. Add targeted tests for the changed behavior. The smoke set is a cross-feature check, not complete coverage.
- Run `npm run check:full` before a release or when broad changes cannot reasonably be covered by a targeted selection. Packaged-application verification remains a separate release check. Do not rebuild installers or run the packaged suite after every small source change.

## Hidden Electron windows

Electron workflows use hidden windows by default, including restarts. The launch helper maps Playwright's `headless` setting to `MARGIN_TEST_HIDDEN=1`; this is an application test mode, not Chromium's headless browser mode. Windows start with `show: false`, continue rendering without background throttling, and omit the macOS Dock icon. Every launch asserts that window visibility matches the requested mode. Normal application launches retain their usual visible windows.

Use `npm run test:e2e:headed -- --grep '<feature>'` (or `npm run test:e2e -- --headed --grep '<feature>'`) when you specifically need visible OS behavior or interactive debugging. Do not silently switch failed hidden tests to visible mode. Hidden tests still exercise real rendered controls, keyboard input, saved files, and existing clipboard/native integrations. They do not establish actual OS foreground-focus behavior.

The suite uses Electron's debugging transport rather than coordinate scripts. Browser downloads are unnecessary: the Electron package supplies Chromium. Screenshots can still be captured from hidden rendered windows; Playwright's HTML report never opens automatically. These defaults also apply to packaged applications rebuilt with the hidden-window support; older executables must be rebuilt or explicitly tested with `--headed`.

Verification on 26 October 2026 (macOS, source application): `npm run check` passed the production build and all 79 Node tests. All three hidden smoke workflows passed in 9.3 seconds. Six additional hidden workflows passed in 13.7 seconds, covering the development server, PDF viewing/search and restart restoration, real PTYs/layout restoration, close prompts/process cleanup, image zoom/resize, and visual context menus with real clipboard operations. Launch assertions checked hidden windows on every restart. The complete Electron suite and packaged applications were not rerun for this strategy change.

## Coverage

Hide code in live previews (29 October 2026, macOS source): the preview heading toggles source panes, outline and terminal visibility while keeping a pinned assignment visible. Hidden source panes are inert. Toggling preserves the iframe, running PHP process, unsaved buffers and preview ratio. `npm run build` and `npm run test:e2e -- --grep 'Teaching live PHP|Teaching live HTML|Teaching live preview divider|P3 QoL split|@smoke'` passed all eight hidden workflows. The divider workflow also passed a focused rerun after adding outline/terminal restoration checks; it covers full-width output, keyboard activation and pinned assignment layout. The PHP workflow checks the running server and browser launch with code hidden. The hidden layout was visually reviewed in `test-results/preview-code-hidden.png`. No installers were rebuilt.

PHP context selection (29 October 2026, macOS source): Start PHP opens a modal with the current file's folder selected and its parent folders available. Only the selected context is copied and used as the PHP document root. The seven PHP Node tests cover scoped unsaved includes, root-relative HTTP assets, context changes, unrelated oversized files and invalid contexts alongside the existing process cleanup checks. The hidden PHP workflow checks Escape/focus restoration, oversized-context errors, recovery with a smaller context and restarting with a different context. The browser icon is checked with intercepted external launches and real HTTP requests for unsaved contents, including the URL after a context change and its disabled state while stopped. `npm run build`, `node --test tests/php-preview.test.mjs` and `npm run test:e2e -- --grep 'Teaching live PHP|Teaching live HTML|Teaching live preview divider'` passed (seven Node tests and three hidden workflows). The popup was visually reviewed in `test-results/php-context-dialog.png`. OPcache is disabled for the preview server; a regression test reproduces stale code after browser requests with caching enabled and passes with caching disabled. No installers were rebuilt.

Toolbar declutter (28 October 2026, Windows source): the source editor no longer reserves a formatting row. Save and formatting actions live in the Document menu; split, outline, focus and theme controls live in View. Save/conflict and formatting feedback are in the footer. The new compact-window workflow checks the two-row chrome at 820 px, keyboard menu navigation and focus restoration, formatting and saving the active file, dirty-tab feedback and both themes. Screenshots: `test-results/decluttered-toolbar.png`, `decluttered-toolbar-light.png` and `decluttered-toolbar-dark.png`.

Verification commands for this change:

```sh
npm run build
node node_modules/@playwright/test/cli.js test --grep 'decluttered toolbar|compact editor|UX clarity readable|formatting preference|code auto-format|format worker|browser worker'
node node_modules/@playwright/test/cli.js test --grep 'Teaching |document outline|P2 QoL outline|P3 QoL split|PDF viewer|P2 QoL Save Copy|decluttered toolbar'
node node_modules/@playwright/test/cli.js test --grep 'PDF viewer opens|Teaching live PHP|P3 QoL split documents'
node --test tests/php-preview.test.mjs
npm run test:e2e:smoke
node node_modules/@playwright/test/cli.js test --grep 'decluttered toolbar'
```

The build, all three smoke workflows and the final compact-toolbar rerun passed; 22 distinct hidden workflows passed across these runs. The first seven focused workflows passed. The 15-workflow related run passed 12; the PDF restart check passed on rerun after making it wait for both the saved active tab and PDF page before forced exit. The two remaining failures reproduce identically in a separate, unmodified export of `30b9c7d`, built with `npm run build` and tested with `node node_modules/@playwright/test/cli.js test --grep 'Teaching live PHP|P3 QoL split documents'`: PHP preview retains its previous output after a syntax error, and the mixed visual/source split restores source scroll to 14 rather than 750. These existing behaviors were left outside this toolbar change. The diagnostic PHP Node suite passed three tests, including actual syntax-error output; its fourth test cannot create a file symlink on this Windows account (`EPERM`). Full regression and packaged applications were not run.

Live-preview divider follow-up (28 October 2026): `npm run build` passed. Eight hidden workflows were verified using `npm run test:e2e -- --grep 'Teaching live preview divider|Teaching live HTML|Teaching live PHP|P3 QoL split|@smoke'`, with the divider workflow rerun after correcting its test locators to use the new window after restart. The divider test exercises actual mouse dragging across the preview without reloading its iframe, keyboard steps/bounds, double-click reset, persisted workspace ratios, resizing beside a pinned assignment, outline placement and closing the preview. The other seven cover existing HTML/PHP previews, both shared split workflows and all three smoke workflows. Packaged applications were not rebuilt.

Presentation theme follow-up (28 October 2026): presentation now defaults to **Follow workspace theme** for both application chrome and source syntax colors. A one-time migration changes the previous persisted light default to follow the workspace; subsequent explicit light/dark overrides survive restart. `npm run build` passed, followed by all seven hidden workflows selected with `npm run test:e2e -- --grep 'Teaching presentation|UX clarity preferences|UX clarity readable|@smoke'`. Coverage includes following live theme changes, migration, override persistence, ordinary-theme restoration, preference behavior, contrast and the three shared smoke workflows. No installers were rebuilt.

- The four `Teaching` Electron workflows cover the separate presentation font/theme profile, F8 and Escape, normal-setting restoration and restart; a pinned Markdown assignment with navigation from either pane, code-tab closure, moves and restart; a pinned PDF alongside live unsaved HTML/CSS, script isolation and preview restoration while CSS is active; and explicit PHP start/stop, unsaved includes, syntax errors and recovery without saving the originals.
- `php-preview.test.mjs` uses real PHP when installed to check rendered output, unsaved project overlays, includes, PHTML execution, original-file preservation, workspace changes, process termination, temporary-copy removal and prompt cancellation of running and queued requests. Filesystem validation and copy-size limits run even without PHP. These tests exclude symlinks and reject escaped paths.

Teaching verification on 28 October 2026 (macOS source): `npm run check` passed the production build and all **88 Node tests**, with PHP installed and no skipped tests. The following hidden Electron checks passed:

```sh
npm run test:e2e -- --grep 'Teaching |HTML visual mode|Markdown visual preview|SVG visual mode|P3 QoL split|PDF viewer|UX clarity|compact editor|Compare files' # 19 workflows
npm run test:e2e:smoke # 3 workflows
npm run test:e2e -- --grep 'native close prompts|PowerShell PTYs' # 2 workflows
```

This selects the affected previews, layouts, preferences and keyboard behavior, the three shared editor/recovery smoke workflows, and adjacent process cleanup. The Explorer selection test now waits for its animation-frame focus change before pressing Space; without that wait, the next key could target the previous row. Presentation screenshots and the PDF/code/result layout were visually reviewed. The full Electron regression suite, packaged applications and installers were not rebuilt or verified for this update.

- `markdown.test.mjs` verifies PHP/HTML code examples (fenced, indented, nested and inline), angle-bracket link destinations, reference definitions, protected-document mode selection, sanitized previews, relative images and heading source offsets. The `Markdown visual preview` Electron workflow covers editable fenced examples, read-only previews of unsaved protected Markdown, reference/fragment links, outline navigation, find in Source, mode restoration after restart and exact BOM/CRLF source preservation. Protected documents still open in Source by default; Visual now provides a read-only preview.

  macOS source verification on 26 October 2026: `npm run build` and `npm test` passed (84 Node tests). `npm run test:e2e -- --grep 'Markdown visual preview|renderer isolation|P3 section menus support protected|HTML visual mode|@smoke'` passed all eight hidden workflows. A temporary copy of the reported `inventaris.md` also rendered in a hidden Electron window with all 100 code blocks and the literal PHP/HTML example; both the copy and original retained their exact bytes. The full Electron suite and packaged applications were not run.

- The three `UX clarity` Electron workflows cover search scope changes with the query retained, multi-word command lookup, exact content-result selection, ordinary Explorer clicks without batch actions, explicit batch mode and keyboard toggling, preference categories/search/empty results, category/all resets and cancellation, preference persistence, measured text contrast in both themes, and keyboard access to the Document menu in an 820 px window. Screenshots: `test-results/ux-preferences.png` and `test-results/ux-compact-dark.png`.

  Use `node node_modules/@playwright/test/cli.js test --grep 'UX clarity|compact editor|@smoke'` after building for the focused interface checks and the three smoke workflows. Adjacent regression coverage is selected with `--grep 'QoL workspace search|QoL navigation|QoL closed tabs|P2 QoL Quick Open|P2 QoL explorer|P3 QoL selection keyboard|Compare files|P3 QoL local history'`. The direct CLI invocation preserves quoted grep expressions on this Windows PowerShell/npm setup. Full regression and packaged application checks remain separate.

  Windows source verification on 26 October 2026: production build passed. The three UX workflows, compact-editor workflow, three smoke workflows and the nine adjacent workflows above passed across focused hidden-window runs. The last seven-workflow run rechecked closed-tab reopening, recent-file persistence, autosave/recovery, both comparisons, local history and compact keyboard/menu access and passed all seven. The full suite, native foreground-focus behavior and packaged applications were not checked for this change.

- The two `Compare files` Electron workflows verify HTML exercise/solution comparisons without opening, formatting or writing either file; CRLF/LF equivalence; highlighted replacements and aligned insertions; previous/next difference navigation; synchronized vertical and independent horizontal scrolling; swapping and identical files; focus restoration; dirty split buffers; tab/explorer comparison menus and two-file selection; missing/binary-file errors and recovery; and explicit truncation when differences fall beyond the 5000-line preview. `test-results/compare-files.png` records the comparison.

  Windows source verification on 26 October 2026: `npm run build` passed. `node --test --test-name-pattern="diff|previews" tests/qol-p2.test.mjs` passed both relevant line-diff tests. The final hidden run used `node node_modules/@playwright/test/cli.js test --grep "Compare files|P2 QoL conflicts|P3 QoL local history|P3 QoL split mode routes"` and passed all five workflows. A separate hidden run with `--grep "Compare files|@smoke|P3 QoL split documents"` passed both comparison workflows and all three smoke workflows. Its existing split restart test failed: the Source pane restored to 14 rather than 750 pixels. The identical failure reproduced against a separately built, unmodified HEAD snapshot with `--grep "P3 QoL split documents"`. The initial unfiltered `tests/qol-p2.test.mjs` run passed three tests but its unrelated Save Copy test was blocked by Windows `EPERM` when creating a symlink. The full regression suite and packaged applications were not run. Playwright was invoked directly because this host's npm/PowerShell combination consumed the forwarded `--grep` option.

- The two `SVG visual mode` Electron workflows verify Source as the default (including uppercase `.SVG`), previews of unsaved XML with gradients and SVG namespaces, CRLF preservation, script isolation, keyboard save/find, external updates, restart restoration, and malformed SVG recovery. Run with `npm run test:e2e -- --grep 'SVG visual mode'`. `test-results/svg-preview.png` records the drawing.

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
