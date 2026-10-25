export async function copyImage(source: string) {
  const bytes = await window.margin.imageBytes(source);
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
  try {
    if (bitmap.width * bitmap.height > 100_000_000)
      throw new Error("The image is too large to copy.");
    // Chromium decodes all previewable raster formats, including WebP/GIF/AVIF.
    // PNG transport preserves original pixel dimensions regardless of zoom.
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The image could not be copied.");
    context.drawImage(bitmap, 0, 0);
    const png = await canvas.convertToBlob({ type: "image/png" });
    await window.margin.copyImage(
      Array.from(new Uint8Array(await png.arrayBuffer())),
    );
  } finally {
    bitmap.close();
  }
}
