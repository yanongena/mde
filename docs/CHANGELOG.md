# Changelog

## Unreleased — project autocomplete and teaching profiles

- Added HTML/PHP project suggestions: CSS classes from linked stylesheets and recursive local imports, file paths, current-document IDs, PHP project functions with parameter/default/return-type information, local variables, core PHP functions and small navigable snippets. Unsaved buffers override disk contents.
- Added PHP signature help with active-argument highlighting, namespace/function-alias resolution and an optional local Phpactor connection for type-aware functions and methods.
- Added Code assistance preferences and a separate presentation completion profile. Presentation defaults to on request, uses a compact larger list, preserves Enter for new lines and confirms deliberate selections with Tab. Escape dismisses assistance before leaving presentation.
- Added editor context-menu commands for completion and PHP parameters. Ctrl+Space opens suggestions, Ctrl+Shift+Space requests parameters and Ctrl+Alt+Space adds descriptions; macOS also supports Option+I.
- See `docs/CODE_ASSISTANCE.md` for behavior, configuration and limits.

## Unreleased — Workbench UI trial

- Added Workbench as the compact default, with a smaller project header, separate file/document rows, neutral light/dark surfaces, a labelled Document menu and direct Outline control. Classic remains available in Preferences without replacing open editors or running processes.
- Grouped visual Markdown insertion and secondary marks into labelled menus using the existing editor commands, and added toolbar arrow-key navigation with visible focus and usable control targets.
- Added Lesson layout for a chosen Markdown/PDF assignment and HTML/PHP source with live preview. The previous layout persists for restoration after restart, follows app moves/Save as, and keeps unsaved text and hidden terminals alive. PHP still starts explicitly.
- Documented the UX research, action destinations and trial behavior in `docs/WORKBENCH.md`.
- Verified the final macOS source build with all 92 Node tests and all 100 hidden Electron workflows. Packaged applications and installers were not rebuilt.

## Unreleased — interface clarity

- Increased secondary text contrast in both themes and raised small interface text; save status and the status bar use 12 px text.
- Added explicit Files / Contents / Commands search scopes, query retention and multi-word command matching.
- Grouped navigation and writing controls, moved secondary actions into a labelled Document menu and kept file tabs readable with two toolbar rows in compact windows.
- Added searchable preference categories, immediate-change guidance and confirmed resets for one category, matching categories or all editable preferences.
- Added explicit Explorer batch selection with keyboard support; ordinary file clicks no longer show Move/Trash actions.

## Unreleased — P3 quality of life

- Added persistent visual reading font size, line height and text width, separate from source typography.
- Added bounded local version history, preview comparisons and restore-to-editor with a checkpoint of current editor contents; snapshots follow app moves and retain original UTF-8/BOM/CRLF bytes.
- Added a keyboard-operated slash insertion menu for headings, tables, checklists, lists, images, code, quotes and dividers, with undo and safe image-chooser cancellation.
- Added explorer multi-selection, range/keyboard selection, group moves with one recovery journal and simultaneous reference updates, and group Trash with incoming-reference warnings and partial-failure handling.
- Added two independent document panes with per-file view state, focus-based navigation, pane path labels, session restoration and pane closing without closing tabs.
- Verified with 54 Node tests, all 59 source Electron workflows and all 58 non-development workflows on the rebuilt packaged Mac app. Final preference/root-menu refinements passed eleven targeted source workflows; final signature, DMG integrity and installer checksum checks completed.

## Unreleased — P2 quality of life

- Added fuzzy/recent Quick Open and direct file:line:column navigation; per-workspace recent files persist and follow app moves.
- Added Save as and Save a copy from current editor contents, exclusive destination creation, collision refusal and relative Markdown link rebasing.
- Added outline tracking, filtering with ancestor context and collapsible sections; draggable/reorderable/pinned tabs with persistent order and pin-aware bulk close.
- Added file/heading selection in the visual link dialog, including dirty headings and encoded duplicate anchors; original text selections survive link picking.
- Added explorer arrow/Home/End/typeahead keyboard traversal and terminals started directly in the chosen directory.
- Added aligned, highlighted conflict lines with line numbers and synchronized vertical scrolling; independent horizontal scrolling keeps long lines readable. Existing copy/reload actions preserve both versions until chosen.
- Verified with 48 Node tests, 51 source Electron workflows and 50 packaged Mac workflows. All eight P2 QoL workflows passed again on the final rebuilt Apple Silicon app; final signature/DMG integrity checks and installer checksum refresh completed.

## Unreleased — P1 quality of life

- Added workspace content search with snippets, file filters, case/whole-word matching, unsaved-buffer overlays and exact result navigation. Result navigation preserves source bytes even with automatic formatting enabled.
- Added visual Markdown find/replace, highlighted matches across inline formatting, result navigation/counts and single-step undo for Replace all. Read-only searching no longer inserts trailing paragraphs.
- Added Back/Forward for file, section and search-result navigation, with selection and scroll restoration. Cursor/selection/reading position survive Visual/Source switches and workspace restart.
- Added Reopen Closed Tab, Cmd/Ctrl+Shift+T and a persistent 20-entry recent-closed list. Discarded text is never stored in closed-tab history.
- Added nine Electron workflows and nine Node tests for search, projections, navigation and session validation. Production build, all 44 Node tests and all 43 source Electron workflows passed. The rebuilt Apple Silicon Mac app passed 26 workflows; signature and DMG integrity checks passed and the installer checksum was refreshed.

## Unreleased — P3 heading menus

- Added section-link and section-title copying to Markdown headings in Visual, Source and the outline, including keyboard context menus. Links use encoded workspace-root paths and escaped Markdown labels, with an HTML clipboard representation for direct pasting into Visual; title copying retains full readable text.
- Unified heading extraction and anchor assignment across menus, outline and link navigation. Duplicate headings, Unicode, inline formatting, Setext headings and unsaved edits are supported; frontmatter and fenced examples are excluded. Copied links navigate to the right duplicate in both editor modes.
- Preserved source line endings without treating opening/copying CRLF files as edits, and mapped raw source offsets to CodeMirror positions for section/outline navigation and formatting history.
- Added four section tests and four Electron workflows, including cross-note navigation, protected source documents and CRLF format/undo/redo. Production build, all 35 Node tests and all 34 source Electron workflows passed; all fifteen P1/P2/P3 menu workflows passed against the rebuilt packaged Apple Silicon Mac application.

## Unreleased — remaining P2 menus

- Added a keyboard-accessible Format submenu for selected visual text, image copy/view/alt/removal actions, code-block copy/language/deletion actions and list indentation/type/checklist actions.
- Image viewers expose fit, actual size, zoom, pixel copying and local file-path/reveal commands. HTTPS images open in a temporary viewer without importing attachments; reference deletion never deletes the image file.
- Added terminal selection/clipboard/view/link actions and explorer folder creation, path copying, native reveal and root creation from empty space. Terminal links are resolved from buffer cells, including wrapped lines and wide characters, independently of hover state.
- Fixed Markdown import of standalone inline images by retaining their paragraph wrapper. Opening or copying an image does not mark the document modified.
- Added six Electron workflows and three terminal-link coordinate tests. Production build, all 31 Node tests and all 30 source Electron workflows passed; all eleven P1/P2 menu workflows also passed against the rebuilt packaged Apple Silicon Mac application.

## Unreleased — context menus

- Added common editing menus to visual/source editors and text fields, source search/replace/comment/format actions, visual link actions and table row/column actions at the clicked cell.
- Added tab menus for save, close, close others/right/all, reveal in explorer and absolute-path copying. Batch closing retains save/discard/cancel handling and stops on cancellation or failed save.
- Unified explorer menus with the shared keyboard-accessible menu component. Menus preserve selections, restore focus, stay within the viewport and support scrolling in short windows. Table structural actions are separate undo steps.
- Added five real Electron regression workflows for clipboard/history, input focus, source commands, table targeting/serialization, hyperlink targeting and inactive-tab/batch-close behavior. Production build, all 28 Node tests and all 24 source Electron workflows passed; the five context-menu workflows also passed against the rebuilt packaged Apple Silicon Mac application.

## Unreleased — image zoom

- Added pointer-anchored scroll-wheel/trackpad zoom to standalone image tabs, with up to 1600% magnification, drag panning, zoom controls, actual size and double-click/fit reset.
- Added keyboard zoom/fit/panning controls, fit-on-resize, per-tab view retention and an image-load error message. Viewing operations leave image bytes unchanged.
- Production build and two real Electron image-preview workflows passed against both source and rebuilt packaged macOS applications, verifying native wheel anchoring, app zoom isolation, panning/reset, zoom limits, tab switching, resizing and original file preservation.

## Unreleased — document outline

- Extended the outline to HTML/HTM, PHP/PHTML, JavaScript/TypeScript, CSS/SCSS/Less, XML/SVG, Vue and Python. Shows nested elements, IDs/classes, heading text and named code symbols, including both sides of mixed PHP/HTML.
- Clicking a source item moves the cursor to its exact offset, even when multiple symbols share a line. Unsaved edits and automatic formatting update the outline; stale parser results are discarded on document changes.
- Markdown outline uses parsed headings, including Setext headings, excluding frontmatter and fenced examples. Duplicate heading names navigate by document order in visual mode.
- Added explicit empty/unsupported/large-file messages and a 500-item cap. Verified with 28 Node tests and the two new Electron outline workflows against both source and rebuilt packaged macOS applications.

## 1.1.0 — 25 October 2026

- Removed the breadcrumb and source-language bars; save status and Markdown mode controls now share the tab bar.
- Replaced native title tooltips with app tooltips that appear after 200 ms on hover and immediately on keyboard focus.
- Added **Automatically format code on open**, enabled by default and persisted in Preferences. Existing installations receive the default automatically.
- Added **Format document**, the matching command-palette entry and **Shift+Alt+F**.
- Uses selected 2/4/8-space indentation; formats embedded CSS and JavaScript in HTML. JSON objects are expanded for readability. Source line endings are retained.
- Formatting is one undoable edit and follows the configured autosave policy. Unsupported or invalid files are left unchanged; dirty recovered drafts are not autoformatted.
- Formatting runs in a worker with bundled parsers, without reading executable workspace formatter configurations. A pending result cannot overwrite intervening typing or external changes.
- Corrected code-editor line-number alignment.
- Verified with 21 Node tests and 14 source-application workflows; the four formatting workflows also passed against the packaged Windows executable.
