import { useEffect, useMemo, useRef, useState } from "react";
import { lineDiff } from "../lib/line-diff";
export function ConflictDiff({
  mine,
  disk,
  leftTitle = "Your editor version",
  rightTitle = "Current disk version",
  navigable = false,
}: {
  mine: string;
  disk: string | null;
  leftTitle?: string;
  rightTitle?: string;
  navigable?: boolean;
}) {
  const rows = useMemo(() => lineDiff(mine, disk ?? ""), [mine, disk]);
  const visibleRows = rows.slice(0, 5000);
  const limited =
    rows.length > 5000 ||
    mine.split(/\r?\n/, 5001).length > 5000 ||
    (disk ?? "").split(/\r?\n/, 5001).length > 5000;
  const changes = visibleRows.flatMap((row, index) =>
    row.changed && !visibleRows[index - 1]?.changed ? [index] : [],
  );
  const [change, setChange] = useState(0);
  const left = useRef<HTMLDivElement>(null),
    right = useRef<HTMLDivElement>(null);
  const mirrored = useRef(new WeakMap<HTMLDivElement, number>());
  useEffect(() => {
    setChange(0);
    if (left.current) left.current.scrollTop = 0;
    if (right.current) right.current.scrollTop = 0;
  }, [mine, disk]);
  const navigate = (direction: number) => {
    const next = (change + direction + changes.length) % changes.length;
    setChange(next);
    for (const pane of [left.current, right.current]) {
      const row =
        pane?.querySelectorAll<HTMLElement>(".diff-line")[changes[next]];
      if (pane && row)
        pane.scrollTop +=
          row.getBoundingClientRect().top -
          pane.getBoundingClientRect().top -
          44;
    }
  };
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
      <div className="diff-summary">
        <p role="status">
          {visibleRows.some((row) => row.changed)
            ? `${visibleRows.filter((row) => row.changed).length} changed rows`
            : limited
              ? "No differences in preview"
              : "No differences"}{" "}
          · scrolls together
          {disk === null ? " · File deleted or unavailable" : ""}
        </p>
        {navigable && (
          <div
            className="diff-navigation"
            role="group"
            aria-label="Difference navigation"
          >
            <button disabled={!changes.length} onClick={() => navigate(-1)}>
              Previous difference
            </button>
            <span role="status">
              {changes.length ? change + 1 : 0} / {changes.length} differences
              {limited ? " in preview" : ""}
            </span>
            <button disabled={!changes.length} onClick={() => navigate(1)}>
              Next difference
            </button>
          </div>
        )}
      </div>
      {limited && (
        <p>
          Limited preview: only the first 5000 lines per file and 5000 aligned
          rows are shown. Differences beyond this preview are not included.
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
                {visibleRows.map((row, index) => (
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
                        : "") +
                      (navigable && index === changes[change]
                        ? " diff-current"
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
                            ? navigable
                              ? "Left change"
                              : "Editor change"
                            : navigable
                              ? "Right change"
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
