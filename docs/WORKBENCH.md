# Workbench UI trial

Workbench is the default interface layout. **Preferences → Appearance & editing → Interface layout** switches between **Workbench · compact** and **Classic · original layout**. The choice persists; existing preferences without this field receive Workbench. Layout switching updates chrome and styling without changing editor keys, buffers, selection state, split panes, preview frames or terminal processes.

## Research and design decisions

Sources reviewed on 30 October 2026:

| Guidance | Application in Margin |
| --- | --- |
| [VS Code UX: views](https://code.visualstudio.com/api/ux-guidelines/views) recommends grouping related view actions and avoiding overloaded toolbars. | File tabs and document controls occupy separate rows. Explorer actions stay with Explorer; preview controls stay with the preview. |
| [JetBrains New UI](https://www.jetbrains.com/help/idea/new-ui.html) uses a simplified project toolbar and a compact mode with smaller chrome. | A 44 px project header, 35 px tab row, neutral surfaces and a restrained green accent distinguish application chrome from document content. Reading and source font preferences stay independent. |
| [NN/g: recognition rather than recall](https://www.nngroup.com/articles/recognition-and-recall/) recommends visible options and recognizable labels. | Document, View and Insert have text labels. Outline and Lesson layout have direct buttons at wider sizes and named entries in View at every size. File actions retain their context menus and shortcuts. |
| [WAI-ARIA toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) describes one Tab stop and arrow navigation within a toolbar. | The Markdown toolbar uses roving focus: Left/Right navigate, Home/End jump between buttons, and native heading selection retains its own Home/End behavior. Escape from a menu returns focus to its trigger. |
| [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) specifies 24 × 24 CSS px targets or sufficient spacing, subject to its exceptions. | Main document controls and tab close buttons meet at least 24 px; primary toolbar controls use 28 px or larger. Coarse pointers receive larger controls. |
| [WCAG focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) requires focused controls to remain visible. | Document controls wrap instead of clipping. Narrow windows use View for secondary layout actions. Existing focus outlines remain; resize handles have an inset focus indicator. |
| [WCAG dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) calls for alternatives to dragging. | Existing move pickers, tab movement menus and keyboard-adjustable dividers remain available. |

These are design inputs, not a claim of complete WCAG conformance or evidence from a user study. Automated contrast and geometry checks cover specified chrome in both themes. Native foreground focus, assistive technology and Windows still require separate platform review.

## Function destinations and preservation

| Existing workflow | Workbench location / behavior |
| --- | --- |
| Open workspace; recent folders; new files/folders | Project chooser, welcome screen and Explorer; existing native File menu and shortcuts remain. |
| Files / Contents / Commands; fuzzy Quick Open; line/column; workspace filters | Global search and existing activity buttons; search scopes and queries are retained. |
| File tree, keyboard navigation, batch selection, move, duplicate, Trash, reference updates | Existing Explorer and context menus; file-operation and recovery implementations are unchanged. |
| Tab order, pins, dirty/conflict markers, close variants, reopen, Back/Forward | File tab row and existing menus/shortcuts; the same tabs and navigation state are used. |
| Visual / Source; protected Markdown; HTML/SVG visual previews | Document controls and existing editors/viewers, including read-only source protection and source-byte preservation. |
| H1–H6, bold, italic, links | Markdown toolbar; heading selector and editor shortcuts remain. |
| Strikethrough, inline code | More formatting menu; the same mark commands and undo history. |
| Lists, tasks, quote, image, table, code block, divider | Insert menu; the same commands, image chooser, clipboard, slash menu and contextual editing tools. |
| Undo/redo; document find/replace; table/list/code-language controls | Toolbar, shortcuts and existing context-sensitive controls. |
| Save, Save all, Save as, Save a copy, format, PDF export, local history, compare | Labelled Document menu and existing contextual/native menus and command palette. |
| Outline and ordinary split | Direct Outline button and View; ordinary split remains independent of the new lesson preset. |
| Pinned Markdown/PDF assignment; live HTML/PHP preview | Existing Pin assignment / Preview controls; new Lesson layout preset combines them without adding an editor or preview engine. |
| Preview ratio, hide/show code, refresh, browser launch, PHP context/start/stop | Existing preview header and divider; PHP never starts automatically. |
| PDF pages, zoom, text search; image zoom/pan/fit; per-tab viewer state | Existing type-specific viewer controls; unchanged file handling. |
| Multiple terminals, shells, working directory, links, clipboard, resize | Existing terminal panel, activity/footer controls and context menus. Hiding a panel keeps its process alive. |
| Focus and presentation; spelling, reading, formatting, autosave, attachments and ignores | View, Present and Preferences; separate presentation settings and category resets remain. |
| Conflicts, saved versions, drafts, recovery journals, external changes and process cleanup | Existing banners, dialogs, footer and close behavior. No save/export/file operation is triggered by switching interface layout. |

## Lesson layout

Lesson layout opens a native modal to choose an existing Markdown/PDF assignment and an HTML/PHP file. Applying it preserves open buffers, pins the assignment, opens the source beside it and shows the existing live preview. Explorer, outline and terminal make room. Running shells remain alive. PHP still requires **Start PHP**.

**Restore layout** restores the preceding active document, split, preview target/visibility, hidden-code state and panel visibility. The baseline persists as bounded, validated layout metadata in the existing workspace session, so restoration also works after restart. It follows app-initiated moves and Save as. Tabs closed or removed in the meantime are excluded from restoration; layout recovery does not reopen or overwrite those files. Newly opened lesson tabs stay open.

Source edits made during the lesson, preview ratio adjustments and document modes keep their latest values; Restore layout does not undo editing or reset per-document preferences. Normal application shutdown retains its existing process cleanup policy.

## Verification

Build and hidden Electron checks are required for this shared shell change. Coverage includes real Markdown commands through the new menus; layout switching without remounting dirty editors or preview documents; lesson selection/cancellation; terminal identity/output while hidden; lesson baseline restoration across restart; both themes; compact-window geometry and keyboard focus. See [TESTING.md](TESTING.md) for the recorded commands and results.
