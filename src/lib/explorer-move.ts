import type { Entry } from "../types";
import { basename, dirname } from "./markdown.ts";

// Match the backend's conservative collision handling on Windows and macOS.
const inside = (name: string, parent: string) => {
  const a = name.toLowerCase(),
    b = parent.toLowerCase();
  return a === b || a.startsWith(b + "/");
};
export const movePath = (from: string, directory: string) =>
  directory ? directory + "/" + basename(from) : basename(from);

export function createMoveValidator(paths: string[], entries: Entry[]) {
  const folders = new Set(
    entries.filter((entry) => entry.directory).map((entry) => entry.path),
  );
  const existing = new Set(entries.map((entry) => entry.path.toLowerCase()));
  return (directory: string) => {
    if (directory && !folders.has(directory))
      return "Choose an existing folder.";
    if (paths.some((path) => inside(directory, path)))
      return "A folder cannot be moved into itself or its subfolders.";
    const moving = paths.filter((path) => dirname(path) !== directory);
    if (!moving.length) return "Already in this folder.";
    const destinations = new Set<string>();
    for (const path of moving) {
      const to = movePath(path, directory).toLowerCase();
      if (destinations.has(to) || existing.has(to))
        return `An item named “${basename(path)}” already exists here.`;
      destinations.add(to);
    }
    return "";
  };
}

export function moveProblem(
  paths: string[],
  directory: string,
  entries: Entry[],
) {
  return createMoveValidator(paths, entries)(directory);
}
