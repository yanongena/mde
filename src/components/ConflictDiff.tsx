import { useMemo, useRef } from "react";
import { lineDiff } from "../lib/line-diff";
export function ConflictDiff({
  mine,
  disk,
  leftTitle = "Your editor version",
  rightTitle = "Current disk version",
}: {
  mine: string;
  disk: string | null;
  leftTitle?: string;
  rightTitle?: string;
}) {
  const rows = useMemo(() => lineDiff(mine, disk ?? ""), [mine, disk]);
  const left = useRef<HTMLDivElement>(null),
    right = useRef<HTMLDivElement>(null);
  const mirrored = useRef(new WeakMap<HTMLDivElement, number>());
  const sync = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    const expected = mirrored.current.get(from);
    if (expected !== undefined) {
      mirrored.current.delete(from);
      if (Math.abs(from.scrollTop - expected) < 1) return;
    }
    if (to && Math.abs(to.scrollTop - from.scrollTop) > 1) {
      mirrored.current.set(to, from.scrollTop);
      to.scrollTop = from.scrollTop;
    }
  };
  return (
    <div className="conflict-diff">
      <p role="status">
        {rows.filter((row) => row.changed).length} changed rows · scrolls
        together{disk === null ? " · File deleted or unavailable" : ""}
      </p>
      {rows.length > 5000 && (
        <p>
          Showing the first 5000 rows. Saving a copy keeps your complete editor
          version.
        </p>
      )}
      <div className="conflict-columns">
        {(["left", "right"] as const).map((side) => (
          <section
            key={side}
            aria-label={side === "left" ? leftTitle : rightTitle}
          >
            <strong>{side === "left" ? leftTitle : rightTitle}</strong>
            <div
              className="diff-scroll"
              tabIndex={0}
              ref={side === "left" ? left : right}
              onScroll={(e) =>
                sync(
                  e.currentTarget,
                  side === "left" ? right.current : left.current,
                )
              }
            >
              <pre>
                {rows.slice(0, 5000).map((row, index) => (
                  <div
                    key={index}
                    className={
                      "diff-line " +
                      (row.changed
                        ? row[side] === undefined
                          ? "diff-gap"
                          : side === "left"
                            ? "diff-mine"
                            : "diff-disk"
                        : "")
                    }
                  >
                    <span className="diff-number" aria-hidden="true">
                      {side === "left" ? row.leftLine : row.rightLine}
                    </span>
                    <span
                      className="diff-sign"
                      aria-label={
                        row.changed && row[side] !== undefined
                          ? side === "left"
                            ? "Editor change"
                            : "Disk change"
                          : undefined
                      }
                    >
                      {row.changed && row[side] !== undefined
                        ? side === "left"
                          ? "−"
                          : "+"
                        : " "}
                    </span>
                    {row[side] ?? " "}
                  </div>
                ))}
              </pre>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
