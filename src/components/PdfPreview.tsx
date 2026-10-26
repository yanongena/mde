import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import {
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  PasswordResponses,
} from "pdfjs-dist";
import {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { positionChanged, registerEditor } from "../lib/editor-position";
import type { EditorPosition } from "../types";

GlobalWorkerOptions.workerSrc = workerUrl;
const assets = new URL("./pdfjs/", document.baseURI).href;
const message = (error: unknown) =>
  (error as Error).message.replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );

export default function PdfPreview({
  path,
  position,
  visible,
}: {
  path: string;
  position?: EditorPosition;
  visible: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const viewerElement = useRef<HTMLDivElement>(null);
  const viewer = useRef<PDFViewer | null>(null);
  const bus = useRef<EventBus | null>(null);
  const saved = useRef(position);
  const ready = useRef(false);
  const [pages, setPages] = useState(0);
  const [activated, setActivated] = useState(visible);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(100);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState({ current: 0, total: 0 });
  const [passwordPrompt, setPasswordPrompt] = useState("");
  const [password, setPassword] = useState("");
  const unlock = useRef<((password: string) => void) | null>(null);
  const findInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (visible) setActivated(true);
  }, [visible]);

  function restore(next: EditorPosition, focus = true) {
    saved.current = next;
    const pdf = viewer.current;
    if (pdf && ready.current) {
      pdf.currentScaleValue = next.pdf?.scale || "page-width";
      pdf.scrollPageIntoView({
        pageNumber: Math.max(1, Math.min(pdf.pagesCount, next.pdf?.page || 1)),
      });
      container.current!.scrollTop = next.scrollTop;
    }
    if (focus) container.current?.focus({ preventScroll: true });
  }
  useEffect(
    () =>
      registerEditor(path, "source", {
        focus: () => container.current?.focus({ preventScroll: true }),
        capture: () => ({
          mode: "source",
          anchor: 0,
          head: 0,
          sourceAnchor: 0,
          sourceHead: 0,
          scrollTop: container.current?.scrollTop || 0,
          topSource: 0,
          topOffset: 0,
          scrollRatio:
            (container.current?.scrollTop || 0) /
            Math.max(
              1,
              (container.current?.scrollHeight || 0) -
                (container.current?.clientHeight || 0),
            ),
          signature: "pdf",
          pdf:
            ready.current && viewer.current
              ? {
                  page: viewer.current.currentPageNumber,
                  scale: viewer.current.currentScaleValue,
                }
              : saved.current?.pdf || { page: 1, scale: "page-width" },
        }),
        restore,
        reveal: () => container.current?.focus(),
      }),
    [path],
  );

  useEffect(() => {
    if (!activated) return;
    let stale = false;
    const controller = new AbortController();
    let task: ReturnType<typeof getDocument> | undefined;
    const eventBus = new EventBus();
    bus.current = eventBus;
    const links = new PDFLinkService({ eventBus });
    // Keep web links explicit and prevent a PDF annotation from navigating the app.
    links.addLinkAttributes = (link: HTMLAnchorElement, url: string) => {
      link.href = /^https?:\/\//i.test(url) ? url : "#";
      link.title = url;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (/^https?:\/\//i.test(url))
          void window.margin
            .external(url)
            .catch((error) => setError(message(error)));
      });
    };
    const find = new PDFFindController({ eventBus, linkService: links });
    const viewerOptions = {
      container: container.current!,
      viewer: viewerElement.current!,
      eventBus,
      linkService: links,
      findController: find,
      annotationMode: AnnotationMode.ENABLE,
      abortSignal: controller.signal,
      imageResourcesPath: assets + "images/",
      maxCanvasPixels: 16_777_216,
    };
    const pdf = new PDFViewer(viewerOptions);
    viewer.current = pdf;
    links.setViewer(pdf);
    let previousWidth = 0;
    const resize = new ResizeObserver(() => {
      const width = container.current?.clientWidth || 0;
      if (!width || width === previousWidth || !ready.current) return;
      previousWidth = width;
      if (["page-width", "page-fit"].includes(pdf.currentScaleValue))
        pdf.currentScaleValue = pdf.currentScaleValue;
      pdf.update();
    });
    resize.observe(container.current!);
    eventBus.on("pagesinit", () => {
      if (stale) return;
      ready.current = true;
      previousWidth = container.current?.clientWidth || 0;
      pdf.currentScaleValue = saved.current?.pdf?.scale || "page-width";
      if (saved.current) restore(saved.current, false);
      setPages(pdf.pagesCount);
    });
    eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      if (stale) return;
      setPage(pageNumber);
      setPageInput(String(pageNumber));
    });
    eventBus.on("scalechanging", ({ scale }: { scale: number }) => {
      if (!stale) setScale(Math.round(scale * 100));
    });
    eventBus.on("updateviewarea", () => {
      if (!stale && ready.current) positionChanged(path, "scroll");
    });
    eventBus.on(
      "updatefindmatchescount",
      ({ matchesCount }: { matchesCount: typeof matches }) => {
        if (!stale) setMatches(matchesCount);
      },
    );
    eventBus.on(
      "updatefindcontrolstate",
      ({ matchesCount }: { matchesCount: typeof matches }) => {
        if (!stale && matchesCount) setMatches(matchesCount);
      },
    );
    eventBus.on("pagerendered", ({ error }: { error?: Error }) => {
      if (!stale && error) setError(message(error));
    });
    const handleFind = (event: Event) => {
      if ((event as CustomEvent).detail?.path === path)
        findInput.current?.focus();
    };
    window.addEventListener("margin:find", handleFind);
    void window.margin
      .pdfRead(path)
      .then(async (data) => {
        if (stale) return;
        task = getDocument({
          data: new Uint8Array(data),
          cMapUrl: assets + "cmaps/",
          cMapPacked: true,
          standardFontDataUrl: assets + "standard_fonts/",
          wasmUrl: assets + "wasm/",
          iccUrl: assets + "iccs/",
          useSystemFonts: true,
        });
        task.onPassword = (
          callback: (password: string) => void,
          reason: number,
        ) => {
          if (stale) return;
          unlock.current = callback;
          setPasswordPrompt(
            reason === PasswordResponses.INCORRECT_PASSWORD
              ? "Incorrect password. Try again."
              : "This PDF is password protected.",
          );
        };
        const document = await task.promise;
        if (stale) return;
        links.setDocument(document);
        pdf.setDocument(document);
        setPasswordPrompt("");
      })
      .catch((error) => {
        if (!stale) setError(message(error));
      });
    return () => {
      stale = true;
      ready.current = false;
      viewer.current = null;
      bus.current = null;
      unlock.current = null;
      resize.disconnect();
      window.removeEventListener("margin:find", handleFind);
      pdf.setDocument(null);
      links.setDocument(null);
      controller.abort();
      void task?.destroy().catch(() => {});
    };
  }, [path, activated]);
  useEffect(() => {
    const pdf = viewer.current;
    if (visible && ready.current && pdf) {
      if (["page-width", "page-fit"].includes(pdf.currentScaleValue))
        pdf.currentScaleValue = pdf.currentScaleValue;
      pdf.update();
    }
  }, [visible]);

  function goToPage(value: number) {
    if (!viewer.current || !pages) return;
    const next = Math.max(1, Math.min(pages, Math.trunc(value) || 1));
    viewer.current.currentPageNumber = next;
    setPageInput(String(next));
  }
  function zoom(factor: number) {
    if (!viewer.current || !pages) return;
    viewer.current.currentScaleValue = String(
      Math.max(0.25, Math.min(4, viewer.current.currentScale * factor)),
    );
  }
  function search(value: string, again = false, previous = false) {
    setQuery(value);
    bus.current?.dispatch("find", {
      source: null,
      type: again ? "again" : "",
      query: value,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    });
  }
  return (
    <div className="pdf-preview" aria-label={`PDF viewer for ${path}`}>
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF controls">
        <button
          className="icon-button small"
          aria-label="Previous PDF page"
          disabled={!pages || page <= 1}
          onClick={() => goToPage(page - 1)}
        >
          <ChevronLeft />
        </button>
        <label className="pdf-page-label">
          Page{" "}
          <input
            aria-label="PDF page"
            type="number"
            min={1}
            max={pages || 1}
            value={pageInput}
            disabled={!pages}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={() => goToPage(Number(pageInput))}
            onKeyDown={(event) => {
              if (event.key === "Enter") goToPage(Number(pageInput));
            }}
          />
        </label>
        <span aria-label="PDF page count">/ {pages || "…"}</span>
        <button
          className="icon-button small"
          aria-label="Next PDF page"
          disabled={!pages || page >= pages}
          onClick={() => goToPage(page + 1)}
        >
          <ChevronRight />
        </button>
        <span className="pdf-toolbar-divider" />
        <div
          className="pdf-zoom-controls"
          role="group"
          aria-label="PDF zoom controls"
        >
          <button
            className="pdf-zoom-button"
            aria-label="Zoom out PDF"
            data-tooltip="Zoom out (−)"
            disabled={!pages || scale <= 25}
            onClick={() => zoom(1 / 1.25)}
          >
            <Minus size={16} /> Zoom out
          </button>
          <button
            className="pdf-scale"
            aria-label="PDF zoom"
            data-tooltip="Reset zoom to 100%"
            disabled={!pages}
            onClick={() => {
              if (viewer.current) viewer.current.currentScaleValue = "1";
            }}
          >
            {scale}%
          </button>
          <button
            className="pdf-zoom-button"
            aria-label="Zoom in PDF"
            data-tooltip="Zoom in (+)"
            disabled={!pages || scale >= 400}
            onClick={() => zoom(1.25)}
          >
            <Plus size={16} /> Zoom in
          </button>
          <button
            className="pdf-zoom-button"
            aria-label="Fit PDF to width"
            data-tooltip="Fit to width"
            disabled={!pages}
            onClick={() => {
              if (viewer.current)
                viewer.current.currentScaleValue = "page-width";
            }}
          >
            <Maximize2 size={16} /> Fit width
          </button>
        </div>
      </div>
      <div className="pdf-find">
        <Search size={14} />
        <input
          ref={findInput}
          aria-label="Find in PDF"
          placeholder="Find in PDF…"
          value={query}
          disabled={!pages}
          onChange={(event) => search(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search(query, true, event.shiftKey);
            }
            if (event.key === "Escape") {
              search("");
              container.current?.focus();
            }
          }}
        />
        {query && (
          <span role="status" aria-label="PDF search results">
            {matches.current} / {matches.total}
          </span>
        )}
        <button
          className="icon-button small"
          aria-label="Previous PDF match"
          disabled={!query}
          onClick={() => search(query, true, true)}
        >
          <ChevronLeft />
        </button>
        <button
          className="icon-button small"
          aria-label="Next PDF match"
          disabled={!query}
          onClick={() => search(query, true)}
        >
          <ChevronRight />
        </button>
      </div>
      {error && (
        <div className="pdf-notice" role="alert">
          Unable to display this PDF: {error}
        </div>
      )}
      {!pages && !error && !passwordPrompt && (
        <div className="pdf-notice" role="status">
          Loading PDF…
        </div>
      )}
      {passwordPrompt && !error && (
        <form
          className="pdf-password"
          onSubmit={(event) => {
            event.preventDefault();
            unlock.current?.(password);
            setPassword("");
          }}
        >
          <p role="status">{passwordPrompt}</p>
          <label>
            PDF password{" "}
            <input
              autoFocus
              type="password"
              aria-label="PDF password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary" type="submit">
            Unlock PDF
          </button>
        </form>
      )}
      <div className="pdf-viewport-host">
        <div
          className="pdf-viewport"
          ref={container}
          tabIndex={0}
          role="region"
          aria-label="PDF pages"
          onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey) return;
            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              zoom(1.25);
            }
            if (event.key === "-") {
              event.preventDefault();
              zoom(1 / 1.25);
            }
          }}
        >
          <div ref={viewerElement} className="pdfViewer" />
        </div>
      </div>
    </div>
  );
}
