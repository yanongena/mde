import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hash, exists, atomicWrite } from "./storage.mjs";
import {
  references,
  rewriteReferences,
  remap,
  isWithin,
  slash,
} from "./references.mjs";

export const DEFAULT_IGNORES = [
  ".git",
  "node_modules",
  ".next",
  ".venv",
  "__pycache__",
  "vendor",
  "dist",
  "build",
  ".DS_Store",
];
const isMarkdown = (name) => /\.(md|markdown|mdown)$/i.test(name);
export class Workspace {
  constructor(root, transactions, ignored = DEFAULT_IGNORES) {
    this.root = path.resolve(root);
    this.transactions = transactions;
    this.ignored = ignored;
    this.pending = Promise.resolve();
  }
  mutate(fn) {
    const result = this.pending.then(() => {
      if (this.transactions.blocked.length)
        throw new Error(
          "Recovery is required before writing. Open Settings for details.",
        );
      return fn();
    });
    this.pending = result.catch(() => {});
    return result;
  }
  async resolve(name = "", allowMissing = false) {
    if (
      typeof name !== "string" ||
      name.includes("\0") ||
      path.isAbsolute(name) ||
      /^[a-z]:/i.test(name)
    )
      throw new Error("Use a workspace-relative path.");
    const relative = slash(name);
    if (
      relative
        .split("/")
        .some(
          (part) =>
            part === ".." ||
            part.toLowerCase() === ".git" ||
            /^\.margin-/i.test(part),
        )
    )
      throw new Error("This path is outside the editable workspace.");
    const absolute = path.resolve(this.root, relative);
    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep))
      throw new Error("Path escapes the workspace.");
    let current = this.root;
    const rootStat = await fs.lstat(this.root);
    if (rootStat.isSymbolicLink())
      throw new Error("Open the real folder instead of a symbolic link.");
    for (const part of path
      .relative(this.root, absolute)
      .split(path.sep)
      .filter(Boolean)) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Error("Symbolic links are excluded for filesystem safety.");
      } catch (e) {
        if (e.code === "ENOENT" && allowMissing) break;
        throw e;
      }
    }
    return absolute;
  }
  async tree() {
    const entries = [];
    let count = 0;
    const walk = async (directory, prefix) => {
      const children = await fs.readdir(directory, { withFileTypes: true });
      children.sort(
        (a, b) =>
          Number(b.isDirectory()) - Number(a.isDirectory()) ||
          a.name.localeCompare(b.name),
      );
      for (const item of children) {
        if (
          this.ignored.includes(item.name) ||
          item.name.startsWith(".margin-") ||
          item.isSymbolicLink()
        )
          continue;
        if (++count > 100000)
          throw new Error(
            "Workspace exceeds 100,000 entries. Add ignored directories in Settings.",
          );
        const name = prefix ? prefix + "/" + item.name : item.name;
        entries.push({
          path: name,
          name: item.name,
          directory: item.isDirectory(),
        });
        if (item.isDirectory())
          await walk(path.join(directory, item.name), name);
      }
    };
    await walk(this.root, "");
    return entries;
  }
  async read(name) {
    const file = await this.resolve(name);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024)
      throw new Error("Only files up to 10 MB can be edited.");
    const bytes = await fs.readFile(file);
    if (bytes.includes(0))
      throw new Error("This is a binary file. It cannot be edited as text.");
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      throw new Error(
        "This file is not UTF-8. Convert its encoding before editing.",
      );
    }
    return { path: slash(name), text, revision: hash(bytes) };
  }
  async save(name, text, expected) {
    return this.mutate(async () => {
      const file = await this.resolve(name);
      const current = await fs.readFile(file);
      if (hash(current) !== expected)
        return { conflict: true, disk: await this.read(name) };
      const data = Buffer.from(text, "utf8");
      await atomicWrite(file, data);
      return { conflict: false, revision: hash(data) };
    });
  }
  async create(name, directory = false) {
    return this.mutate(async () => {
      this.validateName(name);
      const file = await this.resolve(name, true);
      await this.resolve(
        slash(
          path.posix.dirname(slash(name)) === "."
            ? ""
            : path.posix.dirname(slash(name)),
        ),
      );
      if (directory) await fs.mkdir(file);
      else {
        const h = await fs.open(file, "wx");
        await h.close();
      }
      return slash(name);
    });
  }
  validateName(name) {
    if (
      !name ||
      slash(name)
        .split("/")
        .some(
          (part) =>
            !part ||
            /[<>:"|?*\x00-\x1f]/.test(part) ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
    )
      throw new Error(
        "Choose a valid portable filename (no reserved names or trailing dots/spaces).",
      );
  }
  async planMove(from, to) {
    this.validateName(to);
    if (to.split("/").some((part) => this.ignored.includes(part)))
      throw new Error(
        "Choose a destination outside the ignored directories so references remain managed.",
      );
    if (from === to) throw new Error("Choose a different location.");
    if (isWithin(to.toLowerCase(), from.toLowerCase()))
      throw new Error("A folder cannot be moved into itself.");
    const source = await this.resolve(from);
    const destination = await this.resolve(to, true);
    if (await exists(destination))
      throw new Error(
        "The destination already exists. Use a temporary name for case-only renames.",
      );
    await this.resolve(
      path.posix.dirname(to) === "." ? "" : path.posix.dirname(to),
    );
    const edits = [];
    const snapshots = [];
    for (const entry of await this.tree()) {
      if (entry.directory || !isMarkdown(entry.name)) continue;
      const doc = await this.read(entry.path);
      snapshots.push(doc);
      const newPath = remap(doc.path, from, to);
      const after = rewriteReferences(doc.text, doc.path, newPath, from, to);
      if (after !== doc.text)
        edits.push({
          beforePath: await this.resolve(doc.path),
          afterPath: path.join(this.root, newPath),
          before: doc.text,
          after,
        });
    }
    return { source, destination, edits, snapshots };
  }
  async move(from, to, fault) {
    from = slash(from);
    to = slash(to);
    return this.mutate(async () => {
      if (!from) throw new Error("The workspace root cannot be moved.");
      const plan = await this.planMove(from, to);
      return this.transactions.move(
        plan.source,
        plan.destination,
        plan.edits,
        async () => {
          for (const snapshot of plan.snapshots)
            if ((await this.read(snapshot.path)).revision !== snapshot.revision)
              throw new Error(
                `File changed during reference indexing: ${snapshot.path}. Retry the move.`,
              );
        },
        fault,
      );
    });
  }
  async duplicate(from, to) {
    from = slash(from);
    to = slash(to);
    return this.mutate(async () => {
      this.validateName(to);
      if (!from || isWithin(to, from))
        throw new Error(
          "Cannot duplicate inside the original folder or copy the workspace root.",
        );
      const source = await this.resolve(from),
        destination = await this.resolve(to, true);
      if (await exists(destination))
        throw new Error("Destination already exists.");
      await this.resolve(
        path.posix.dirname(to) === "." ? "" : path.posix.dirname(to),
      );
      const entries = await this.tree();
      // Do not let recursive copy follow or copy symlinks hidden by the explorer.
      const assertNoLinks = async (file) => {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink())
          throw new Error(
            "Folders containing symbolic links cannot be duplicated.",
          );
        if (stat.isDirectory())
          for (const name of await fs.readdir(file))
            await assertNoLinks(path.join(file, name));
      };
      await assertNoLinks(source);
      const staging = path.join(this.root, ".margin-copy-" + randomUUID());
      await fs.mkdir(staging);
      const payload = path.join(staging, "payload");
      try {
        await fs.cp(source, payload, {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
        // A duplicate keeps references to the original targets, including its own original notes.
        const docs = entries.filter(
          (e) => !e.directory && isMarkdown(e.name) && isWithin(e.path, from),
        );
        for (const entry of docs) {
          const text = (await this.read(entry.path)).text;
          const newName = remap(entry.path, from, to);
          const after = rewriteReferences(
            text,
            entry.path,
            newName,
            "__no_move__",
            "__no_move__",
          );
          if (text !== after)
            await atomicWrite(
              path.join(
                payload,
                entry.path.slice(from.length).replace(/^\//, ""),
              ),
              after,
            );
        }
        if (await exists(destination))
          throw new Error(
            "Destination was created externally during the copy.",
          );
        await fs.rename(payload, destination);
      } finally {
        await fs.rm(staging, { recursive: true, force: true });
      }
      return to;
    });
  }
  async incoming(name) {
    const incoming = [];
    for (const entry of await this.tree())
      if (
        !entry.directory &&
        isMarkdown(entry.name) &&
        !isWithin(entry.path, name)
      ) {
        if (
          references((await this.read(entry.path)).text, entry.path).some(
            (ref) => isWithin(ref.target, name),
          )
        )
          incoming.push(entry.path);
      }
    return incoming;
  }
  async attachment(documentPath, bytes, filename, settings) {
    return this.mutate(async () => {
      await this.resolve(documentPath);
      const data = Buffer.from(bytes);
      if (data.length > 30 * 1024 * 1024)
        throw new Error("Image exceeds the 30 MB attachment limit.");
      // Validate image signature. SVG is intentionally excluded because it can contain active content.
      let extension;
      if (
        data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        extension = ".png";
      else if (data[0] === 255 && data[1] === 216 && data[2] === 255)
        extension = ".jpg";
      else if (/^GIF8[79]a/.test(data.subarray(0, 6).toString()))
        extension = ".gif";
      else if (
        data.subarray(0, 4).toString() === "RIFF" &&
        data.subarray(8, 12).toString() === "WEBP"
      )
        extension = ".webp";
      else throw new Error("Use a PNG, JPEG, GIF or WebP image.");
      const base =
        settings.attachmentMode === "nearby"
          ? path.posix.join(
              path.posix.dirname(documentPath),
              settings.attachmentFolder || "images",
            )
          : settings.attachmentFolder || "assets";
      const directory = await this.resolve(base, true);
      await fs.mkdir(directory, { recursive: true });
      await this.resolve(base);
      const stem =
        (path
          .parse(filename || "image")
          .name.replace(/[^a-z\d_-]+/gi, "-")
          .slice(0, 60) || "image") +
        "-" +
        new Date().toISOString().slice(0, 10);
      const attachmentName = stem + "-" + randomUUID().slice(0, 8) + extension;
      const target = path.join(directory, attachmentName);
      await fs.writeFile(target, data, { flag: "wx" });
      const relative = slash(
        path.relative(path.dirname(await this.resolve(documentPath)), target),
      );
      return {
        path: slash(path.relative(this.root, target)),
        url: relative.split("/").map(encodeURIComponent).join("/"),
      };
    });
  }
}
