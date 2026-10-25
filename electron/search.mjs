import { textMatches } from "./search-core.mjs";

export function pathFilter(patterns, name) {
  return patterns
    .split(/[,\n]/)
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .some((pattern) => {
      let source = "";
      for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === "*" && pattern[i + 1] === "*") {
          i++;
          if (pattern[i + 1] === "/") {
            i++;
            source += "(?:.*/)?";
          } else source += ".*";
        } else if (pattern[i] === "*") source += "[^/]*";
        else if (pattern[i] === "?") source += "[^/]";
        else source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      return new RegExp(`^${source}$`, "i").test(
        pattern.includes("/") ? name : name.split("/").pop(),
      );
    });
}

export async function searchWorkspace(workspace, request, signal) {
  if (
    !request ||
    typeof request.id !== "string" ||
    request.id.length > 100 ||
    typeof request.query !== "string" ||
    request.query.length > 1000 ||
    typeof request.include !== "string" ||
    request.include.length > 2000 ||
    typeof request.exclude !== "string" ||
    request.exclude.length > 2000 ||
    !Array.isArray(request.overlays) ||
    request.overlays.length > 100
  )
    throw new Error("Invalid search request.");
  const overlays = new Map();
  for (const overlay of request.overlays) {
    if (
      typeof overlay.text !== "string" ||
      overlay.text.length > 12 * 1024 * 1024
    )
      throw new Error("Invalid search buffer.");
    await workspace.resolve(overlay.path, true);
    overlays.set(overlay.path, overlay.text);
  }
  const result = {
    matches: [],
    files: 0,
    skipped: 0,
    truncated: false,
    cancelled: false,
  };
  if (!request.query) return result;
  const entries = await workspace.tree();
  for (const entry of entries) {
    if (signal?.aborted) {
      result.cancelled = true;
      break;
    }
    if (
      entry.directory ||
      /\.(png|jpe?g|gif|webp|bmp|ico|avif|svgz|pdf|zip|dmg|exe|woff2?|ttf)$/i.test(
        entry.path,
      )
    )
      continue;
    if (
      (request.include.trim() && !pathFilter(request.include, entry.path)) ||
      (request.exclude.trim() && pathFilter(request.exclude, entry.path))
    )
      continue;
    let text;
    try {
      text =
        overlays.get(entry.path) ?? (await workspace.read(entry.path)).text;
    } catch {
      result.skipped++;
      continue;
    }
    result.files++;
    let line = 1,
      cursor = 0,
      lineStart = 0;
    for (const hit of textMatches(text, request, 501)) {
      if (result.matches.length >= 500) {
        result.truncated = true;
        break;
      }
      while (cursor < hit.from) {
        if (text[cursor++] === "\n") {
          line++;
          lineStart = cursor;
        }
      }
      const end = text.indexOf("\n", hit.from);
      const previewStart = Math.max(lineStart, hit.from - 65);
      const previewEnd = Math.min(
        end < 0 ? text.length : end,
        Math.max(hit.to, previewStart + 180),
      );
      result.matches.push({
        path: entry.path,
        ...hit,
        line,
        column: hit.from - lineStart + 1,
        preview: text.slice(previewStart, previewEnd).replace(/\r/g, ""),
        matchStart: hit.from - previewStart,
        matchEnd: Math.min(hit.to, previewEnd) - previewStart,
        value: text.slice(hit.from, hit.to),
      });
    }
    if (result.truncated) break;
  }
  result.cancelled ||= !!signal?.aborted;
  return result;
}
