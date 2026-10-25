export function parseFileQuery(value: string) {
  const match = value.match(/^(.*?):([1-9]\d*)(?::([1-9]\d*))?$/);
  return match
    ? {
        query: match[1],
        line: Math.min(1e9, Number(match[2])),
        column: Math.min(1e9, Number(match[3] || 1)),
      }
    : { query: value.trim(), line: undefined, column: undefined };
}
export function fuzzyScore(path: string, query: string): number | null {
  const text = path.toLowerCase(),
    needle = query.trim().toLowerCase();
  if (!needle) return 0;
  let cursor = 0,
    score = 0,
    previous = -2;
  for (const char of needle) {
    const index = text.indexOf(char, cursor);
    if (index < 0) return null;
    score +=
      10 +
      (index === previous + 1 ? 12 : 0) +
      (index === 0 || /[\/_.\- ]/.test(text[index - 1]) ? 18 : 0);
    previous = index;
    cursor = index + 1;
  }
  const base = text.slice(text.lastIndexOf("/") + 1);
  return (
    score +
    (previous === text.length - 1 ? 25 : 0) +
    (base === needle
      ? 150
      : base.startsWith(needle)
        ? 70
        : base.includes(needle)
          ? 40
          : 0) -
    text.length * 0.1
  );
}
export function quickFiles<T extends { path: string; directory: boolean }>(
  entries: T[],
  query: string,
  recent: string[],
) {
  return entries
    .filter((entry) => !entry.directory)
    .map((entry) => ({
      entry,
      score: fuzzyScore(entry.path, query),
      recent: recent.indexOf(entry.path),
    }))
    .filter((item) => item.score !== null)
    .sort((a, b) => {
      if (!query.trim())
        return (
          (a.recent < 0 ? 1e6 : a.recent) - (b.recent < 0 ? 1e6 : b.recent) ||
          a.entry.path.localeCompare(b.entry.path)
        );
      return (
        b.score! - a.score! ||
        (a.recent < 0 ? 1e6 : a.recent) - (b.recent < 0 ? 1e6 : b.recent) ||
        a.entry.path.localeCompare(b.entry.path)
      );
    })
    .slice(0, 100)
    .map((item) => item.entry);
}
export function lineOffset(text: string, line: number, column = 1) {
  let from = 0;
  for (let index = 1; index < line; index++) {
    const next = text.indexOf("\n", from);
    if (next < 0) return text.length;
    from = next + 1;
  }
  const next = text.indexOf("\n", from);
  const end = next < 0 ? text.length : next - (text[next - 1] === "\r" ? 1 : 0);
  return Math.min(end, from + column - 1);
}
