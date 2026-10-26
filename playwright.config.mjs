import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  // The Electron launch helper translates headless/--headed to hidden/visible windows.
  use: { headless: true, trace: "retain-on-failure" },
});
