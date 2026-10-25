import type { Terminal } from "@xterm/xterm";

// Resolve links from public buffer cells rather than hover state: opening a
// menu can end hover while the terminal still caches the same active link.
export function terminalLinkAt(
  term: Terminal,
  row: number,
  column: number,
): string | null {
  const buffer = term.buffer.active;
  let first = row,
    last = row;
  while (first > 0 && row - first < 100 && buffer.getLine(first)?.isWrapped)
    first--;
  while (last - first < 100 && buffer.getLine(last + 1)?.isWrapped) last++;
  if (buffer.getLine(first)?.isWrapped || buffer.getLine(last + 1)?.isWrapped)
    return null;
  let text = "",
    clicked = -1;
  for (let y = first; y <= last; y++) {
    const line = buffer.getLine(y);
    if (!line) break;
    for (let x = 0; x < term.cols; x++) {
      const cell = line.getCell(x);
      if (!cell || !cell.getWidth()) continue;
      if (
        x === term.cols - 1 &&
        !cell.getChars() &&
        buffer.getLine(y + 1)?.isWrapped &&
        buffer
          .getLine(y + 1)
          ?.getCell(0)
          ?.getWidth() === 2
      )
        continue;
      if (y === row && column >= x && column < x + cell.getWidth())
        clicked = text.length;
      text += cell.getChars() || " ";
    }
  }
  // Match the web-links addon's URL boundaries, including trimmed punctuation.
  const urls =
    /(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/g;
  for (const match of text.matchAll(urls)) {
    if (clicked >= match.index && clicked < match.index + match[0].length)
      return match[0];
  }
  return null;
}
