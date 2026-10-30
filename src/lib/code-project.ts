import type { CodeProject } from "../../electron/code-intelligence.mjs";
import type { Settings } from "../types";
export type CodeBuffer = { path: string; text: string };
export const completionMode = (settings: Settings) =>
  settings.presentationMode
    ? settings.presentationCompletionMode
    : settings.completionMode;
export class CodeProjectClient {
  root = "";
  overlays: CodeBuffer[] = [];
  cached?: { path: string; text: string; result: Promise<CodeProject> };
  update(root: string, overlays: CodeBuffer[]) {
    if (root !== this.root || overlays !== this.overlays) this.invalidate();
    this.root = root;
    this.overlays = overlays;
  }
  invalidate() {
    this.cached = undefined;
  }
  buffers(path: string, text: string) {
    return [
      ...this.overlays.filter((entry) => entry.path !== path),
      { path, text },
    ];
  }
  project(path: string, text: string) {
    if (this.cached?.path === path && this.cached.text === text)
      return this.cached.result;
    const result = window.margin.codeProject({
      path,
      overlays: this.buffers(path, text),
    });
    const cached = (this.cached = { path, text, result });
    result.catch(() => {
      if (this.cached === cached) this.invalidate();
    });
    return result;
  }
}
