"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDeck } from "./deck-context";

type Load =
  | { state: "loading" }
  | { state: "ready"; doc: PDFDocumentProxy }
  | { state: "error" };

// The Deal page's deck viewer (§18): one page at a time, drawn by PDF.js
// into a canvas, with page buttons. Citation chips move it to their page
// and show the quoted snippet under the page. The quote is the text the
// model cited from the page's visible text; the PDF's own text layer isn't
// used, since hidden text lives there (§15.2).
export function DeckViewer({ src }: { src: string }) {
  const { page, selected, showPage, viewerRef } = useDeck();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Set by the cleanup, read after awaits.
    const effect = { cancelled: false };
    let destroy: (() => Promise<void>) | null = null;
    setLoad({ state: "loading" });
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      // Hostile decks (§15.2): no XFA forms, images capped at 32 megapixels,
      // and a broken object skips that object instead of failing the page.
      const task = pdfjs.getDocument({
        url: src,
        enableXfa: false,
        maxImageSize: 32 * 1024 * 1024,
        stopAtErrors: false,
      });
      destroy = () => task.destroy();
      const doc = await task.promise;
      if (!effect.cancelled) {
        setLoad({ state: "ready", doc });
      }
    })().catch((error: unknown) => {
      if (!effect.cancelled) {
        console.error("Deck viewer: loading the deck failed", error);
        setLoad({ state: "error" });
      }
    });
    return () => {
      effect.cancelled = true;
      destroy?.().catch((error: unknown) => {
        console.error("Deck viewer: closing the deck failed", error);
      });
    };
  }, [src, attempt]);

  // Redraw at the frame's width.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setWidth(Math.round(entry.contentRect.width));
      }
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, []);

  const pageCount = load.state === "ready" ? load.doc.numPages : null;
  const current = pageCount === null ? page : Math.min(page, pageCount);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (load.state !== "ready" || canvas === null || width === 0) {
      return;
    }
    let task: RenderTask | null = null;
    const effect = { cancelled: false };
    (async () => {
      const pdfPage = await load.doc.getPage(current);
      if (effect.cancelled) {
        return;
      }
      const ratio = window.devicePixelRatio;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({
        scale: (width * ratio) / base.width,
      });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = pdfPage.render({ canvas, viewport });
      await task.promise;
    })().catch((error: unknown) => {
      // Cancelling a render (page change, resize) rejects its promise.
      if (
        !effect.cancelled &&
        !(
          error instanceof Error && error.name === "RenderingCancelledException"
        )
      ) {
        console.error("Deck viewer: drawing the page failed", error);
        setLoad({ state: "error" });
      }
    });
    return () => {
      effect.cancelled = true;
      task?.cancel();
    };
  }, [load, current, width]);

  const quote =
    selected !== null && selected.page === current ? selected.snippet : null;

  return (
    <div ref={viewerRef} className="scroll-mt-20">
      <section
        aria-label="Pitch deck"
        className="rounded-lg border"
        onKeyDown={(event) => {
          if (pageCount === null) {
            return;
          }
          if (event.key === "ArrowRight" && current < pageCount) {
            showPage(current + 1);
          }
          if (event.key === "ArrowLeft" && current > 1) {
            showPage(current - 1);
          }
        }}
      >
        <header className="flex items-center gap-2 rounded-t-lg border-b bg-subtle px-4 py-2">
          <h2 className="font-semibold">Pitch deck</h2>
          <span
            className="tabular ml-auto text-xs text-faint-foreground"
            aria-live="polite"
          >
            {pageCount === null
              ? "Loading…"
              : `Page ${String(current)} of ${String(pageCount)}`}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={pageCount === null || current <= 1}
            onClick={() => {
              showPage(current - 1);
            }}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={pageCount === null || current >= pageCount}
            onClick={() => {
              showPage(current + 1);
            }}
          >
            <ChevronRight />
          </Button>
        </header>

        <div className="p-4">
          <div
            ref={frameRef}
            className="relative aspect-video overflow-hidden rounded-md border bg-background"
          >
            {load.state === "loading" && (
              <div className="absolute inset-0 animate-pulse bg-muted" />
            )}
            {load.state === "error" ? (
              <div
                role="alert"
                className="absolute inset-0 grid place-items-center gap-2 bg-danger-soft p-4 text-center text-danger"
              >
                <div>
                  <p>Couldn&apos;t load the deck.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setAttempt((n) => n + 1);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`Deck page ${String(current)}`}
                className="block h-full w-full"
              />
            )}
          </div>

          {quote !== null && (
            <figure className="mt-3 rounded-md border border-brand/30 bg-brand-soft px-3 py-2">
              <figcaption className="text-xs text-muted-foreground">
                Quoted from page {current}
              </figcaption>
              <blockquote className="mt-0.5">&ldquo;{quote}&rdquo;</blockquote>
            </figure>
          )}

          {pageCount !== null && (
            <nav
              aria-label="Deck pages"
              className="mt-3 flex gap-2 overflow-x-auto pb-1"
            >
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-current={n === current ? "page" : undefined}
                  aria-label={`Page ${String(n)}`}
                  onClick={() => {
                    showPage(n);
                  }}
                  className={cn(
                    "tabular flex aspect-video w-16 shrink-0 items-start rounded border bg-subtle px-1.5 py-0.5 text-xs text-faint-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                    n === current && "border-2 border-brand text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </nav>
          )}
        </div>
      </section>
      <p className="mt-2 text-xs text-faint-foreground">
        Click any citation to jump to its page. The highlighted quote is what
        the AI cited.
      </p>
    </div>
  );
}
