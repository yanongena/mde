import fs from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { isBrowserFile } from "./browser-files.mjs";

async function launchBrowser(browser, url) {
  if (process.platform === "darwin") {
    await promisify(execFile)("/usr/bin/open", ["-a", browser, url]);
    return;
  }
  await new Promise((resolve, reject) => {
    const child = spawn(browser, [url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function openInBrowser(
  workspace,
  name,
  app,
  launch = launchBrowser,
) {
  const file = await workspace.resolve(name);
  if (!isBrowserFile(name) || !(await fs.stat(file)).isFile())
    throw new Error("This file type cannot be opened in a browser.");
  // Opening a file through shell.openPath/openExternal would use its file
  // association, which may be a PDF reader or image editor rather than a browser.
  const browser = await app.getApplicationInfoForProtocol("https://");
  if (!browser.path) throw new Error("No default browser could be found.");
  await launch(browser.path, pathToFileURL(file).href);
}
