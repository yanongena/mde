import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
export async function atomicWrite(file, data) {
  const temporary = path.join(
    path.dirname(file),
    `.margin-${randomUUID()}.tmp`,
  );
  let handle;
  try {
    const mode = await fs
      .stat(file)
      .then((s) => s.mode)
      .catch(() => 0o600);
    handle = await fs.open(temporary, "wx", mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, file);
  } finally {
    await handle?.close();
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
export async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw new Error(
      `Cannot read ${path.basename(file)}. Original data was retained: ${e.message}`,
    );
  }
}
export async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await atomicWrite(file, JSON.stringify(data, null, 2));
}
