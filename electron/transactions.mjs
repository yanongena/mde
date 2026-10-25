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
    if (record.moves) return this.rollbackBatch(record);
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
  async moveMany(moves, edits, check, fault) {
    if (this.blocked.length)
      throw new Error(
        "Unresolved recovery journal blocks filesystem mutations.",
      );
    await fs.mkdir(this.directory, { recursive: true });
    const record = {
      id: randomUUID(),
      state: "prepared",
      created: new Date().toISOString(),
      moves,
      edits: edits.map((edit) => ({
        beforePath: edit.beforePath,
        afterPath: edit.afterPath,
        before: Buffer.from(edit.before).toString("base64"),
        beforeHash: hash(edit.before),
        afterHash: hash(edit.after),
      })),
    };
    const file = path.join(this.directory, record.id + ".json");
    await writeJSON(file, record);
    const renamed = [];
    try {
      await check();
      for (const move of moves) {
        if (await exists(move.to))
          throw new Error("The destination already exists.");
        await fs.rename(move.from, move.to);
        renamed.push(move);
        if (fault) await fault(move);
      }
      for (const edit of edits) {
        if (hash(await fs.readFile(edit.afterPath)) !== hash(edit.before))
          throw new Error("A file changed during the batch move.");
        await atomicWrite(edit.afterPath, edit.after);
      }
      record.state = "committed";
      await writeJSON(file, record);
      return { referencesUpdated: edits.length };
    } catch (error) {
      try {
        if (renamed.length)
          await this.rollbackBatch({ ...record, moves: renamed });
        record.state = "rolled-back";
        await writeJSON(file, record);
      } catch (rollbackError) {
        this.blocked.push({ file, message: rollbackError.message });
        throw new Error(
          `Batch recovery paused. Originals are in ${file}: ${rollbackError.message}`,
        );
      }
      throw error;
    }
  }
  async rollbackBatch(record) {
    const locations = [];
    for (const move of record.moves) {
      const source = await exists(move.from),
        destination = await exists(move.to);
      if (source === destination)
        throw new Error(
          "A batch move location is ambiguous. Preserve both locations and inspect its journal.",
        );
      locations.push({ ...move, moved: destination });
    }
    const location = (edit) => {
      const move = locations.find(
        (move) =>
          edit.beforePath === move.from ||
          edit.beforePath.startsWith(move.from + path.sep),
      );
      return move?.moved
        ? move.to + edit.beforePath.slice(move.from.length)
        : edit.beforePath;
    };
    for (const edit of record.edits) {
      if (
        ![edit.beforeHash, edit.afterHash].includes(
          hash(await fs.readFile(location(edit))),
        )
      )
        throw new Error("External changes prevent automatic batch recovery.");
    }
    for (const edit of record.edits)
      await atomicWrite(location(edit), Buffer.from(edit.before, "base64"));
    for (const move of [...locations].reverse())
      if (move.moved) await fs.rename(move.to, move.from);
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
