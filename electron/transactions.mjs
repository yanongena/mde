import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { exists, hash, readJSON, writeJSON, atomicWrite } from "./storage.mjs";

export class Transactions {
  constructor(directory) {
    this.directory = directory;
    this.blocked = [];
  }
  async recover() {
    await fs.mkdir(this.directory, { recursive: true });
    this.blocked = [];
    for (const name of await fs.readdir(this.directory)) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(this.directory, name);
      try {
        const record = await readJSON(file);
        if (record.state === "committed" || record.state === "rolled-back")
          continue;
        await this.rollback(record);
        record.state = "rolled-back";
        await writeJSON(file, record);
      } catch (e) {
        this.blocked.push({ file, message: e.message });
      }
    }
    return this.blocked;
  }
  async rollback(record) {
    const moved = await exists(record.to);
    const original = await exists(record.from);
    if (moved && original)
      throw new Error(
        "Both move locations exist. Preserve both and inspect the recovery journal.",
      );
    // Check every file before changing anything. Later external edits must survive recovery.
    for (const edit of record.edits) {
      const location = moved ? edit.afterPath : edit.beforePath;
      const data = await fs.readFile(location);
      if (![edit.beforeHash, edit.afterHash].includes(hash(data)))
        throw new Error(
          `External changes at ${location}; automatic recovery paused.`,
        );
    }
    for (const edit of record.edits)
      await atomicWrite(
        moved ? edit.afterPath : edit.beforePath,
        Buffer.from(edit.before, "base64"),
      );
    if (moved) await fs.rename(record.to, record.from);
  }
  async move(from, to, edits, check, fault) {
    if (this.blocked.length)
      throw new Error(
        "Unresolved recovery journal blocks filesystem mutations. See Settings → Recovery folder.",
      );
    await fs.mkdir(this.directory, { recursive: true });
    const record = {
      id: randomUUID(),
      state: "prepared",
      created: new Date().toISOString(),
      from,
      to,
      edits: edits.map((e) => ({
        beforePath: e.beforePath,
        afterPath: e.afterPath,
        before: Buffer.from(e.before).toString("base64"),
        beforeHash: hash(e.before),
        afterHash: hash(e.after),
      })),
    };
    const file = path.join(this.directory, record.id + ".json");
    await writeJSON(file, record);
    let renamed = false;
    try {
      await check();
      if (await exists(to)) throw new Error("The destination already exists.");
      await fs.rename(from, to);
      renamed = true;
      if (fault) await fault();
      for (const edit of edits) {
        // Recheck immediately before replacing each original.
        if (hash(await fs.readFile(edit.afterPath)) !== hash(edit.before))
          throw new Error(`File changed during move: ${edit.afterPath}`);
        await atomicWrite(edit.afterPath, edit.after);
      }
      record.state = "committed";
      await writeJSON(file, record);
      return { journal: file, referencesUpdated: edits.length };
    } catch (error) {
      try {
        if (renamed) await this.rollback(record);
        record.state = "rolled-back";
        await writeJSON(file, record);
      } catch (rollbackError) {
        this.blocked.push({ file, message: rollbackError.message });
        throw new Error(
          `Operation interrupted. Originals are in ${file}. Recovery paused: ${rollbackError.message}`,
        );
      }
      throw error;
    }
  }
}
