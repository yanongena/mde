import { BrowserWindow } from "electron";

export async function renderPdf(html, signal) {
  signal?.throwIfAborted();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  const abort = () => {
    if (!window.isDestroyed()) window.destroy();
  };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, 60000);
  signal?.addEventListener("abort", abort, { once: true });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  try {
    await window.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html),
    );
    // Wait for image decoding, including remote images; fail clearly on missing assets.
    await window.webContents.executeJavaScript(`(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode().catch(() => {
        throw new Error('An image could not be loaded: ' + (image.alt || 'unnamed image'));
      })));
    })()`);
    signal?.throwIfAborted();
    return await window.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:center;color:#777"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } catch (error) {
    if (timedOut)
      throw new Error(
        "PDF rendering timed out after 60 seconds. Check whether remote images can be reached.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    abort();
  }
}
