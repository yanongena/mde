export function selectionRoots(paths) {
  if (
    !Array.isArray(paths) ||
    paths.length > 100 ||
    !paths.length ||
    paths.some(
      (name) => typeof name !== "string" || !name || name.includes("\\"),
    )
  )
    throw new Error("Select between 1 and 100 workspace items.");
  const unique = [...new Set(paths)];
  return unique.filter(
    (name) =>
      !unique.some(
        (parent) => parent !== name && name.startsWith(parent + "/"),
      ),
  );
}
