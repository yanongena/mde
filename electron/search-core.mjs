export function textMatches(text, options, limit = 2000) {
  if (!options.query) return [];
  const escaped = options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(escaped, options.caseSensitive ? "gu" : "giu");
  const results = [];
  for (const match of text.matchAll(expression)) {
    const from = match.index,
      to = from + match[0].length;
    if (
      options.wholeWord &&
      (/[\p{L}\p{N}_]$/u.test(text.slice(Math.max(0, from - 2), from)) ||
        /^[\p{L}\p{N}_]/u.test(text.slice(to, to + 2)))
    )
      continue;
    results.push({ from, to });
    if (results.length >= limit) break;
  }
  return results;
}
