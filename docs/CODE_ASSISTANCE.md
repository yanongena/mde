# Code assistance

HTML, PHP and CSS source editors support project-aware suggestions. The built-in analyzer works locally without installing PHP, a language server or an online service.

## HTML and CSS

Link a stylesheet normally:

```html
<link rel="stylesheet" href="css/style.css">
<div class="kaart"></div>
```

Classes declared in that stylesheet, including nested selectors and local `@import` dependencies, appear when completing `class`. PHP templates also recognize stylesheets in literal includes such as `require __DIR__ . '/header.php'`. Unrelated stylesheets are excluded. Unsaved CSS buffers replace the disk version immediately, including a buffer cleared to empty.

`src`, `href`, `action` and `poster` suggest workspace-relative file paths; names with spaces are URL-encoded. `for` and `href="#…"` suggest IDs in the current document and its literal PHP includes. Standard HTML tag, attribute and value completion, CSS property/value completion and embedded language support remain available. Small explicit snippets include `html:5`, `link:css`, `form:post` and `input:label`.

Remote stylesheets, computed PHP output and dynamic include expressions are not indexed. CSS selectors are parsed without running document code.

## PHP

Named functions from non-ignored PHP project files appear with parameter names, types, defaults, variadics and declared return types. Current-file and included functions rank ahead of other project files. Function calls use the current namespace, explicit qualification and simple/grouped `use function` aliases for parameter resolution. Current-scope variables and common superglobals are suggested; the fragment currently being typed is excluded.

Accepting a function adds an empty pair of parentheses if needed and places the cursor inside. Parameter hints emphasize the current argument, ignoring commas inside nested calls, arrays and strings. Function bodies stay yours to write. `if`, `foreach` and `function` snippets supply small skeletons; Tab and Shift+Tab move through their fields. Undo uses the ordinary editor history.

The bundled core-function catalog was captured using PHP 8.5 Reflection. It is a curated set of common functions, not a complete or target-version-specific PHP API. Built-in project analysis is syntactic: it does not infer object types or perform semantic diagnostics. Methods are supplied by the optional Phpactor integration.

## Keyboard and presentation

| Action | Shortcut |
| --- | --- |
| Open suggestions | Ctrl+Space; Option+I also works on macOS |
| Open suggestions with descriptions | Ctrl+Alt+Space |
| Request PHP parameters | Ctrl+Shift+Space |
| Select a suggestion | Up/Down |
| Accept | Tab; Enter also accepts during ordinary editing |
| Navigate snippet fields | Tab / Shift+Tab |
| Dismiss assistance | Escape |

Source context menus also offer **Complete code** and, for PHP, **Function parameters**.

Preferences → **Code assistance** controls ordinary autocomplete and parameter hints. Preferences → **Teaching & presentation** stores a separate completion profile: **On request** (default), **Quiet automatic**, or **Off**. These preferences survive restart. Leaving presentation restores the ordinary profile.

Presentation shows a compact larger list, initially without a selected result. Choose with an arrow key, then confirm with Tab; Enter always inserts a line. Parameter hints and longer descriptions appear on request. Escape dismisses the active list, snippet field navigation or parameter hint before it can leave presentation. A dismissed parameter hint stays closed for that call until further typing or an explicit request.

## Optional Phpactor

For deeper PHP type and method suggestions, install [Phpactor](https://phpactor.readthedocs.io/en/master/usage/standalone.html) and choose **Built-in + Phpactor** in **Code assistance → PHP project analysis**. Enter the installed executable name or absolute path. An absolute path to `phpactor.phar` is also supported when PHP is installed. Use **Check Phpactor connection** to verify the setup and see startup errors.

Margin launches `phpactor language-server` locally. Open dirty PHP buffers are synchronized before completion/signature requests. Lazy server details supply parameter information in the suggestion list. If Phpactor is missing or fails, built-in suggestions continue to work. Disabling it, changing executable, switching workspace or closing the application stops the process. Margin does not install Phpactor automatically.

A downloaded Phpactor 2026.10.07.0 PHAR was verified with PHP 8.5.12 in a temporary workspace, including a real hidden Electron session: inferred instance-method completion, signature details, insertion of parentheses and active second-argument highlighting. The PHAR was used only for verification and is not a bundled dependency.

## Index bounds

The built-in index respects ignored directories and skips symlinks, files above 1 MB, more than 500 PHP files, more than 100 linked stylesheets, import/include depth above 20 and content beyond 20 MB per request. Large or generated projects may therefore have incomplete built-in suggestions. File moves, deletions, external changes and unsaved edits invalidate cached results. The editor never saves a file merely to obtain suggestions.
