export function savedPosition(value) {
  if (
    !value ||
    !["visual", "source"].includes(value.mode) ||
    typeof value.signature !== "string" ||
    value.signature.length > 100
  )
    return undefined;
  const result = { mode: value.mode, signature: value.signature };
  for (const key of [
    "anchor",
    "head",
    "sourceAnchor",
    "sourceHead",
    "scrollTop",
    "topSource",
    "topOffset",
    "scrollRatio",
  ]) {
    if (!Number.isFinite(value[key])) return undefined;
    result[key] = Math.max(
      key === "topOffset" ? -1e7 : 0,
      Math.min(key === "scrollRatio" ? 1 : 1e9, value[key]),
    );
    if (
      ["anchor", "head", "sourceAnchor", "sourceHead", "topSource"].includes(
        key,
      )
    )
      result[key] = Math.trunc(result[key]);
  }
  return result;
}
