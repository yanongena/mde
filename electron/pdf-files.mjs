import fs from "node:fs/promises";

export async function readPdf(workspace, name) {
  if (typeof name !== "string" || !/\.pdf$/i.test(name))
    throw new Error("Choose a PDF file.");
  const target = await workspace.resolve(name);
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024)
    throw new Error("Only PDF files up to 100 MB can be viewed.");
  const data = await fs.readFile(target);
  if (!data.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new Error("This file is not a valid PDF.");
  return new Uint8Array(data);
}
