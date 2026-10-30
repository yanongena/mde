import fs from "node:fs/promises";
import {
  isPhp,
  isWebCode,
  phpSymbols,
  cssSymbols,
  htmlSymbols,
  workspaceTarget,
} from "./code-symbols.mjs";

const MAX_FILE = 1_000_000,
  MAX_TOTAL = 20_000_000,
  MAX_PHP_FILES = 500;
export class CodeIntelligence {
  constructor(workspace) {
    this.workspace = workspace;
    this.cache = new Map();
    this.generation = 0;
  }
  invalidate(paths) {
    this.generation++;
    this.entries = undefined;
    if (!paths) this.cache.clear();
    else for (const path of paths) this.cache.delete(path);
  }
  async project(request) {
    if (
      !request ||
      typeof request.path !== "string" ||
      !isWebCode(request.path)
    )
      throw new Error("Choose an HTML, CSS or PHP file.");
    await this.workspace.resolve(request.path, true);
    if (!Array.isArray(request.overlays) || request.overlays.length > 100)
      throw new Error("Invalid code buffers.");
    const overlays = new Map();
    let overlaySize = 0;
    for (const entry of request.overlays) {
      if (
        !entry ||
        typeof entry.path !== "string" ||
        typeof entry.text !== "string" ||
        (overlaySize += entry.text.length) > MAX_TOTAL
      )
        throw new Error("Code buffers exceed 20 MB.");
      if (!isWebCode(entry.path)) continue;
      await this.workspace.resolve(entry.path, true);
      if (
        entry.path
          .split("/")
          .some((part) => this.workspace.ignored.includes(part))
      )
        continue;
      overlays.set(entry.path, entry.text);
    }
    const generation = this.generation;
    const entries = await (this.entries ||= this.workspace
      .tree()
      .catch((error) => {
        this.entries = undefined;
        throw error;
      }));
    const paths = entries.filter((e) => !e.directory).map((e) => e.path);
    const available = new Set(paths);
    for (const name of overlays.keys()) available.add(name);
    const result = {
      functions: [],
      classes: [],
      cssClasses: [],
      ids: [],
      paths: [...available],
      related: [],
      truncated: false,
    };
    let total = 0;
    const loaded = new Map();
    const read = async (name) => {
      if (loaded.has(name)) return loaded.get(name);
      loaded.set(name, null);
      try {
        let text = overlays.get(name),
          parsed;
        if (text === undefined) {
          const cached = this.cache.get(name);
          if (cached) {
            total += cached.size;
            if (total > MAX_TOTAL) {
              result.truncated = true;
              return null;
            }
            loaded.set(name, cached);
            return cached;
          }
          const file = await this.workspace.resolve(name);
          if ((await fs.stat(file)).size > MAX_FILE) {
            result.truncated = true;
            return null;
          }
          text = (await this.workspace.read(name)).text;
        }
        if (text.length > MAX_FILE || (total += text.length) > MAX_TOTAL) {
          result.truncated = true;
          return null;
        }
        if (isPhp(name)) {
          const php = phpSymbols(text, name);
          parsed = { php, html: htmlSymbols(php.html), size: text.length };
        } else if (/\.css$/i.test(name))
          parsed = { css: cssSymbols(text), size: text.length };
        else parsed = { html: htmlSymbols(text), size: text.length };
        if (!overlays.has(name) && generation === this.generation) {
          if (this.cache.size >= 600)
            this.cache.delete(this.cache.keys().next().value);
          this.cache.set(name, parsed);
        }
        loaded.set(name, parsed);
        return parsed;
      } catch {
        return null;
      } // Missing includes and concurrent moves are ordinary while editing.
    };
    const related = new Set();
    const visitPhp = async (name, depth = 0) => {
      if (related.has(name) || depth > 20 || related.size >= MAX_PHP_FILES)
        return;
      related.add(name);
      const file = await read(name);
      for (const target of file?.php?.includes || [])
        if (available.has(target)) await visitPhp(target, depth + 1);
    };
    await visitPhp(request.path);
    result.related = [...related];
    const cssClasses = new Map(),
      ids = new Set(),
      sheets = new Set();
    const addCss = (css, source) => {
      for (const name of css.classes)
        if (!cssClasses.has(name)) cssClasses.set(name, { name, path: source });
    };
    const visitCss = async (name, depth = 0) => {
      if (sheets.has(name) || depth > 20 || sheets.size >= 100) {
        if (sheets.size >= 100) result.truncated = true;
        return;
      }
      sheets.add(name);
      const file = await read(name);
      if (!file?.css) return;
      addCss(file.css, name);
      for (const href of file.css.imports) {
        const target = workspaceTarget(name, href);
        if (target && available.has(target)) await visitCss(target, depth + 1);
      }
    };
    for (const name of related) {
      const file = await read(name);
      if (file?.css) await visitCss(name);
      if (!file?.html) continue;
      for (const id of file.html.ids) ids.add(id);
      for (const inline of file.html.inlineStyles)
        addCss(cssSymbols(inline), name);
      for (const href of file.html.stylesheets) {
        const target = workspaceTarget(name, href);
        if (target && available.has(target)) await visitCss(target);
      }
    }
    result.cssClasses = [...cssClasses.values()];
    result.ids = [...ids];
    if (isPhp(request.path)) {
      const candidates = [
        ...new Set([
          ...related,
          ...paths.filter(isPhp),
          ...[...overlays.keys()].filter(isPhp),
        ]),
      ];
      if (candidates.length > MAX_PHP_FILES) result.truncated = true;
      for (const name of candidates.slice(0, MAX_PHP_FILES)) {
        const file = await read(name);
        if (!file?.php) continue;
        result.functions.push(...file.php.functions);
        result.classes.push(...file.php.classes);
      }
    }
    return result;
  }
}
