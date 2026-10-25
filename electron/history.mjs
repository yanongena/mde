import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hash, readJSON, writeJSON, atomicWrite } from "./storage.mjs";
export class FileHistory {
  constructor(directory, settings = () => ({})) {
    this.directory = directory;
    this.settings = settings;
    this.pending = Promise.resolve();
  }
  run(action) {
    const operation = this.pending.then(action);
    this.pending = operation.catch(() => {});
    return operation;
  }
  async index() {
    const entries = await readJSON(path.join(this.directory, "index.json"), []);
    if (
      !Array.isArray(entries) ||
      entries.some(
        (entry) =>
          !/^[-\da-f]{36}$/.test(entry.id) ||
          !Number.isFinite(entry.bytes) ||
          typeof entry.path !== "string",
      )
    )
      throw new Error(
        "Invalid local history index. Original history was retained.",
      );
    return entries;
  }
  async store(entries, removed = []) {
    await writeJSON(path.join(this.directory, "index.json"), entries);
    await Promise.all(
      removed.map((entry) =>
        fs.rm(path.join(this.directory, entry.id + ".txt"), { force: true }),
      ),
    );
  }
  async pruneEntries(entries) {
    const settings = this.settings(),
      cap = (settings.historyLimitMB ?? 100) * 1024 * 1024,
      count = settings.historyVersions ?? 20;
    const keep = [],
      removed = [],
      perFile = new Map();
    let size = 0;
    for (const entry of [...entries].reverse()) {
      const key = entry.workspace + "\0" + entry.path,
        n = perFile.get(key) || 0;
      if (n >= count || size + entry.bytes > cap || keep.length >= 5000)
        removed.push(entry);
      else {
        keep.push(entry);
        size += entry.bytes;
        perFile.set(key, n + 1);
      }
    }
    await this.store(keep.reverse(), removed);
  }
  prune() {
    return this.run(async () => {
      await this.pruneEntries(await this.index());
      const ids = new Set(
        (await this.index()).map((entry) => entry.id + ".txt"),
      );
      for (const file of await fs.readdir(this.directory))
        if (/^[-\da-f]{36}\.txt$/.test(file) && !ids.has(file))
          await fs.rm(path.join(this.directory, file), { force: true });
    });
  }
  capture(root, name, text, reason = "Saved version") {
    return this.run(async () => {
      if (this.settings().historyEnabled === false) return;
      const bytes = Buffer.from(text, "utf8");
      if (bytes.length > 10 * 1024 * 1024)
        throw new Error("History snapshots are limited to 10 MB.");
      const workspace = hash(root),
        contentHash = hash(bytes),
        entries = await this.index();
      const previous = entries
        .filter((entry) => entry.workspace === workspace && entry.path === name)
        .at(-1);
      if (previous?.hash === contentHash) return;
      const entry = {
        id: randomUUID(),
        workspace,
        path: name,
        hash: contentHash,
        bytes: bytes.length,
        created: new Date().toISOString(),
        reason,
      };
      await fs.mkdir(this.directory, { recursive: true });
      await atomicWrite(path.join(this.directory, entry.id + ".txt"), bytes);
      await this.pruneEntries([...entries, entry]);
    });
  }
  list(root, name) {
    return this.run(async () =>
      (await this.index())
        .filter(
          (entry) => entry.workspace === hash(root) && entry.path === name,
        )
        .reverse()
        .map(({ id, created, bytes, reason }) => ({
          id,
          created,
          bytes,
          reason,
        })),
    );
  }
  read(root, name, id) {
    return this.run(async () => {
      const entry = (await this.index()).find(
        (entry) =>
          entry.workspace === hash(root) &&
          entry.path === name &&
          entry.id === id,
      );
      if (!entry) throw new Error("This version is no longer available.");
      const bytes = await fs.readFile(
        path.join(this.directory, entry.id + ".txt"),
      );
      if (hash(bytes) !== entry.hash)
        throw new Error("This history snapshot changed or is damaged.");
      return bytes.toString("utf8");
    });
  }
  remap(root, moves) {
    return this.run(async () => {
      const workspace = hash(root);
      const entries = (await this.index()).map((entry) => {
        const move = moves.find(
          (move) =>
            entry.path === move.from || entry.path.startsWith(move.from + "/"),
        );
        return entry.workspace === workspace && move
          ? { ...entry, path: move.to + entry.path.slice(move.from.length) }
          : entry;
      });
      await this.store(entries);
    });
  }
}
