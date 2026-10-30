// A lesson preset stores only layout metadata; paths must already belong to validated tabs.
export function savedLessonLayout(value, tabs) {
  if (!value || typeof value !== "object") return null;
  const has = (name) =>
    typeof name === "string" && tabs.some((tab) => tab.path === name);
  const pair = value.split;
  return {
    active: has(value.active) ? value.active : "",
    split:
      pair &&
      pair.left !== pair.right &&
      has(pair.left) &&
      (has(pair.right) || (pair.assignment === true && pair.right === ""))
        ? {
            left: pair.left,
            right: pair.right,
            assignment: pair.assignment === true,
          }
        : null,
    livePreview: value.livePreview === true,
    previewTarget:
      has(value.previewTarget) &&
      /\.(html?|php|phtml)$/i.test(value.previewTarget)
        ? value.previewTarget
        : "",
    previewCodeHidden: value.previewCodeHidden === true,
    sidebarVisible: value.sidebarVisible === true,
    terminalVisible: value.terminalVisible === true,
    outlineVisible: value.outlineVisible === true,
  };
}

export function savedPosition(value) {
  if (
    !value ||
    !["visual", "source"].includes(value.mode) ||
    typeof value.signature !== "string" ||
    value.signature.length > 100
  )
    return undefined;
  const result = { mode: value.mode, signature: value.signature };
  if (
    value.pdf &&
    Number.isInteger(value.pdf.page) &&
    value.pdf.page >= 1 &&
    value.pdf.page <= 1e7 &&
    (["page-width", "page-fit"].includes(value.pdf.scale) ||
      (Number.isFinite(Number(value.pdf.scale)) &&
        Number(value.pdf.scale) >= 0.25 &&
        Number(value.pdf.scale) <= 4))
  )
    result.pdf = { page: value.pdf.page, scale: String(value.pdf.scale) };
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
