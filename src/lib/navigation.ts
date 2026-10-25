import type { EditorPosition } from "../types";
export interface NavigationEntry {
  path: string;
  position?: EditorPosition;
}
export class NavigationHistory {
  entries: NavigationEntry[] = [];
  index = -1;
  reset(entry?: NavigationEntry) {
    this.entries = entry ? [entry] : [];
    this.index = entry ? 0 : -1;
  }
  checkpoint(entry?: NavigationEntry) {
    if (entry && this.entries[this.index]?.path === entry.path)
      this.entries[this.index] = entry;
  }
  record(before: NavigationEntry | undefined, after: NavigationEntry) {
    if (this.index < 0 && before) this.reset(before);
    this.checkpoint(before);
    const current = this.entries[this.index];
    if (
      current?.path === after.path &&
      current.position?.sourceAnchor === after.position?.sourceAnchor &&
      current.position?.sourceHead === after.position?.sourceHead &&
      Math.abs(
        (current.position?.scrollTop || 0) - (after.position?.scrollTop || 0),
      ) < 2
    )
      return;
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(after);
    if (this.entries.length > 100) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  move(direction: -1 | 1, before?: NavigationEntry) {
    const next = this.index + direction;
    if (next < 0 || next >= this.entries.length) return undefined;
    this.checkpoint(before);
    this.index = next;
    return this.entries[next];
  }
  mapPaths(map: (path: string) => string) {
    this.entries = this.entries.map((entry) => ({
      ...entry,
      path: map(entry.path),
    }));
  }
  removePaths(contains: (path: string) => boolean) {
    const previous = this.entries
      .slice(0, this.index + 1)
      .filter((entry) => !contains(entry.path)).length;
    this.entries = this.entries.filter((entry) => !contains(entry.path));
    this.index = Math.min(this.entries.length - 1, previous - 1);
  }
}
