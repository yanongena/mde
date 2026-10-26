# Verification

Keep routine verification focused and unobtrusive. See `docs/TESTING.md` for commands and coverage.

- For a small change, run the relevant Node test files. Run `npm run build` when production TypeScript, renderer code, assets, or Electron/renderer integration changes.
- `npm run check` runs the build and all windowless Node tests. It is the normal broad local check; it deliberately does not launch Electron.
- For UI changes, build first and run the affected Electron workflows using `npm run test:e2e -- --grep '<feature>'`. Include related shared behavior, not just the new test.
- Use `npm run test:e2e:smoke` for a small cross-feature check of visual authoring, code editing, and autosave/recovery after shared UI changes. Do not automatically add the entire E2E suite to every change.
- Reserve `npm run check:full` for release verification, an explicit full-regression request, or broad changes whose impact cannot reasonably be covered by targeted tests. Explain the selection and report exactly what ran.
- Electron tests use hidden windows by default. Keep that mode; use `--headed` only when visible OS behavior or interactive debugging is specifically needed. Do not silently retry a failing hidden test with visible windows.
- Existing clipboard and native integration behavior is intentional. Do not add clipboard isolation, CI infrastructure, or native-dialog changes unless requested.
