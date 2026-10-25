# Testing Margin

## Commands

```sh
npm ci
npm run build
npm test
npm run test:e2e
```

`npm run check` runs the last three commands. There are 21 Node regression/integration tests and 14 Electron workflow tests. Tests use fresh temporary workspace folders and fresh application-data directories. They never operate on the user's ordinary notes. The E2E clipboard tests change the system clipboard. Native dialogs are substituted only in the image-picker test; the attachment backend, image file writing and editor insertion are real. The other workflow tests drive real Electron controls through Playwright.

`npm test` includes a real PTY shell test. It writes commands, verifies computed output and shell state, resizes the terminal and checks process termination. `npm run test:e2e` launches visible application windows. Allow it to finish before using the test application's controls. It uses Electron's debugging transport rather than coordinate scripts. Browser downloads are unnecessary: the Electron package supplies Chromium.

## Coverage

- `references.test.mjs`: destination-only rewrites; titles; anchors; queries; spaces/Unicode; percent encoding; root, self and relative links; reference definitions; nested folder moves; code/frontmatter preservation.
- `workspace.test.mjs`: real tree/create/save/duplicate; optimistic conflicts; image/note/folder moves; unopened incoming links; injected failure rollback; collisions; traversal; reserved names; symlink exclusion; attachment modes and unique names; startup journal recovery and later external edits; BOM/CRLF; non-UTF-8/binary refusal.
- `terminals.test.mjs`: actual PTY commands, persistent shell variables, multiple shells, dimensions and termination.
- `formatting.test.mjs`: real HTML/embedded CSS/JS formatting, idempotence, indentation, CRLF, cursor position, JSON semantic preservation, JS/TS/CSS/YAML/XML/PHP parsers, invalid syntax and unsupported/mixed-language refusal.
- `e2e/workspace.spec.mjs`: development launch; graphical authoring; tables and checkboxes; repeated mode switching/save/reopen; native image clipboard; image rename/move and inline rendering; all twelve required source languages; code editing/search/conflicts; PowerShell commands with filesystem effects; terminal switching; layout/session persistence; forced-exit draft recovery; autosave/quick open; heading levels and formatting; nested lists; hyperlinks and rich-text paste; chosen/dropped images; explorer drag/drop, duplicate and OS Trash; close cancel/draft retention and process cleanup; renderer confinement, JSON diagnostics and literal HTML code fences.

The workflow assertions inspect saved bytes on disk as well as rendered controls. Terminal tests assert calculated output and a file created by the shell, so echoed command strings cannot satisfy them.

The formatting workflows additionally verify the default-on setting, four-space indentation, single-step undo/redo, saved output, preference persistence after restart, manual shortcut/command, invalid-code preservation and concurrent typing during worker execution. JSON/YAML/XML/PHP are exercised in the actual sandboxed browser worker. `test-results/code-formatting.png` records the formatted HTML editor.

## Packaged binary check

After `npm run dist:win`, the same E2E suite can target the packaged application:

```powershell
$env:MARGIN_TEST_EXECUTABLE = (Resolve-Path 'release/win-unpacked/Margin.exe').Path
npm run test:e2e
Remove-Item Env:MARGIN_TEST_EXECUTABLE
```

For Margin 1.1, the four formatting workflows were run successfully against `release/win-unpacked/Margin.exe` using this override and a `--grep` filter. The full fourteen-workflow run was against the source application. Package generation alone is not a runtime verification. Native installer installation/uninstallation is a separate OS-level acceptance check.

## Visual review

The suite records `test-results/visual-authoring.png` and `test-results/dark-terminal.png`; the HTML report lives in `playwright-report/`. Failure traces are retained. A native desktop-control inspection was also attempted in this session, then stopped by the user's physical Escape key. No further native desktop input was sent after that stop.

## Platform status

This delivery was tested on Windows 11 x64, Node 24.19 and Electron 45. macOS source paths and shell selection exist, but no Mac was available for runtime validation. Mac CI should run the same suite and produce/sign/notarize a DMG before a public Mac release. Windows artifacts are unsigned; public distribution needs a trusted signing certificate. Fault injection verifies ordinary rollback and conservative journal recovery, not hardware-level durability under every power-loss/filesystem failure.
