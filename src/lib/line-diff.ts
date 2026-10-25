export interface DiffRow {
  left?: string;
  right?: string;
  leftLine?: number;
  rightLine?: number;
  changed: boolean;
}
export function lineDiff(left: string, right: string): DiffRow[] {
  const a = left.split(/\r?\n/, 5001),
    b = right.split(/\r?\n/, 5001);
  let prefix = 0,
    suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
    prefix++;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++;
  const rows: DiffRow[] = [];
  const add = (
    i: number | undefined,
    j: number | undefined,
    changed: boolean,
  ) =>
    rows.push({
      left: i === undefined ? undefined : a[i],
      right: j === undefined ? undefined : b[j],
      leftLine: i === undefined ? undefined : i + 1,
      rightLine: j === undefined ? undefined : j + 1,
      changed,
    });
  for (let i = 0; i < prefix; i++) add(i, i, false);
  const n = a.length - prefix - suffix,
    m = b.length - prefix - suffix;
  if ((n + 1) * (m + 1) <= 2_000_000) {
    const dp = new Uint32Array((n + 1) * (m + 1)),
      width = m + 1;
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i * width + j] =
          a[prefix + i] === b[prefix + j]
            ? dp[(i + 1) * width + j + 1] + 1
            : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    let i = 0,
      j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[prefix + i] === b[prefix + j]) {
        add(prefix + i++, prefix + j++, false);
        continue;
      }
      const deleted: number[] = [],
        inserted: number[] = [];
      while (i < n || j < m) {
        if (i < n && j < m && a[prefix + i] === b[prefix + j]) break;
        if (
          i < n &&
          (j >= m || dp[(i + 1) * width + j] >= dp[i * width + j + 1])
        )
          deleted.push(prefix + i++);
        else inserted.push(prefix + j++);
      }
      for (let k = 0; k < Math.max(deleted.length, inserted.length); k++)
        add(deleted[k], inserted[k], true);
    }
  } else
    for (let i = 0; i < Math.max(n, m); i++)
      add(i < n ? prefix + i : undefined, i < m ? prefix + i : undefined, true);
  for (let i = 0; i < suffix; i++)
    add(a.length - suffix + i, b.length - suffix + i, false);
  return rows;
}
