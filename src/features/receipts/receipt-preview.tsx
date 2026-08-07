"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_RECEIPT_SIZE_BYTES } from "@/server/expenses/receipt-validation";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";

// pdf.js must not be imported at module scope: its bundle references browser-only
// globals (DOMMatrix) during evaluation, which would break server-side rendering.
// It is loaded lazily inside the render effect, which only runs in the browser.
const WORKER_SRC = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type Status = "loading" | "ready" | "error" | "empty";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.25;

function nextScale(current: number, step: number) {
  const zoomed = Math.round(current / ZOOM_STEP + step) * ZOOM_STEP;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoomed));
}

// Lazily-loaded PDF document, cached per claim so zoom re-renders do not
// re-download the bytes; replaced (and destroyed) when the claim changes.
type CachedDocument = {
  claimId: string;
  task: PDFDocumentLoadingTask;
  pdf: PDFDocumentProxy;
};

export function ReceiptPreview({
  claimId,
  fileName,
  className,
  onClose,
}: {
  claimId: string;
  fileName?: string;
  className?: string;
  onClose?: () => void;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const documentRef = useRef<CachedDocument | null>(null);

  // Reset zoom and start from loading when the claim changes, without letting
  // the render effect run twice for one claim change.
  const [previousClaimId, setPreviousClaimId] = useState(claimId);
  if (previousClaimId !== claimId) {
    setPreviousClaimId(claimId);
    setScale(1);
    setStatus("loading");
  }

  useEffect(() => {
    const container = innerRef.current;
    if (!container) return;
    let cancelled = false;
    const renderTasks: RenderTask[] = [];

    async function load(scrollContainer: HTMLDivElement) {
      let pdf = documentRef.current?.claimId === claimId ? documentRef.current.pdf : null;
      if (!pdf) {
        try {
          // The previous receipt is no longer needed once a new claim is shown.
          const stale = documentRef.current;
          documentRef.current = null;
          void stale?.task.destroy();
          const response = await fetch(`/api/expenses/${encodeURIComponent(claimId)}/receipt`);
          if (!response.ok) throw new Error(`receipt request failed: ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength === 0) {
            if (!cancelled) setStatus("empty");
            return;
          }
          if (bytes.byteLength > MAX_RECEIPT_SIZE_BYTES) throw new Error("receipt exceeds size limit");
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
          const task = pdfjs.getDocument({ data: bytes });
          const document = await task.promise;
          if (cancelled) {
            // The claim switched (or the component unmounted) while loading;
            // the document is never needed, so release it immediately.
            void task.destroy();
            return;
          }
          documentRef.current = { claimId, task, pdf: document };
          pdf = document;
        } catch {
          if (!cancelled) setStatus("error");
          return;
        }
      }

      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          // The claim may have switched while the page was loading; a
          // cancelled render must never append to the new claim's container.
          if (cancelled) {
            page.cleanup();
            return;
          }
          const viewport = page.getViewport({ scale });
          const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * devicePixelRatio);
          canvas.height = Math.floor(viewport.height * devicePixelRatio);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = "rounded-md bg-white shadow-sm shrink-0 max-w-none";
          const renderTask = page.render({
            canvas,
            transform:
              devicePixelRatio === 1 ? undefined : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
            viewport,
          });
          renderTasks.push(renderTask);
          canvasesRef.current.push(canvas);
          scrollContainer.appendChild(canvas);
          await renderTask.promise;
          page.cleanup();
        }
        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        // A cancelled render task is expected during cleanup, not a failure.
        const interrupted =
          error instanceof Error && error.name === "RenderingCancelledException";
        if (!interrupted) setStatus("error");
      }
    }

    void load(container);

    return () => {
      cancelled = true;
      for (const task of renderTasks) task.cancel();
      for (const canvas of canvasesRef.current) canvas.remove();
      canvasesRef.current = [];
    };
  }, [claimId, scale]);

  // Free the cached document (and its canvases) when the component unmounts.
  useEffect(() => {
    return () => {
      const cached = documentRef.current;
      documentRef.current = null;
      void cached?.task.destroy();
    };
  }, []);

  function zoomIn() {
    setScale((current) => nextScale(current, 1));
  }

  function zoomOut() {
    setScale((current) => nextScale(current, -1));
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const container = containerRef.current;
    if (event.key === "+" || event.key === "=") {
      zoomIn();
    } else if (event.key === "-" || event.key === "_") {
      zoomOut();
    } else if (event.key === "0") {
      setScale(1);
    } else if (event.key === "ArrowLeft") {
      if (container) {
        event.preventDefault();
        container.scrollLeft -= 40;
      }
    } else if (event.key === "ArrowRight") {
      if (container) {
        event.preventDefault();
        container.scrollLeft += 40;
      }
    } else if (event.key === "ArrowUp") {
      if (container) {
        event.preventDefault();
        container.scrollTop -= 40;
      }
    } else if (event.key === "ArrowDown") {
      if (container) {
        event.preventDefault();
        container.scrollTop += 40;
      }
    }
  }

  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    setIsPanning(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragStartRef.current || !containerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    containerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    containerRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  }

  function stopDragging() {
    if (dragStartRef.current) {
      dragStartRef.current = null;
      setIsPanning(false);
    }
  }

  useEffect(() => {
    if (!isPanning) return;

    function handleGlobalUp() {
      stopDragging();
    }

    window.addEventListener("mouseup", handleGlobalUp);
    window.addEventListener("pointerup", handleGlobalUp);

    return () => {
      window.removeEventListener("mouseup", handleGlobalUp);
      window.removeEventListener("pointerup", handleGlobalUp);
    };
  }, [isPanning]);

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;
    const container = containerRef.current;
    if (!container) return;

    const touch = e.touches[0];
    setIsPanning(true);
    dragStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!dragStartRef.current || !containerRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragStartRef.current.x;
    const dy = touch.clientY - dragStartRef.current.y;
    containerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    containerRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  }

  function handleTouchEnd() {
    stopDragging();
  }

  const ready = status === "ready";
  const percentage = Math.round(scale * 100);

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-muted", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium" title={fileName}>
            {fileName ?? "Receipt"}
          </p>
        </div>
        <div role="group" aria-label="Zoom controls" className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={!ready || scale <= MIN_SCALE}
            onClick={zoomOut}
          >
            <ZoomOut />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Reset zoom to 100%"
            disabled={!ready || scale === 1}
            onClick={() => setScale(1)}
          >
            <span aria-live="polite">{percentage}%</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={!ready || scale >= MAX_SCALE}
            onClick={zoomIn}
          >
            <ZoomIn />
          </Button>
          {onClose ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close receipt preview"
              onClick={onClose}
              className="ml-1 text-muted-foreground hover:text-foreground"
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      <div
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label={fileName ? `Receipt: ${fileName}` : "Receipt document"}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={cn(
          "flex min-h-48 flex-1 flex-col overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50 select-none",
          isPanning ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        <div
          ref={innerRef}
          className="flex min-w-full w-max min-h-full flex-col items-center justify-center gap-3 p-4"
        >
          {!ready && (
            <div className="m-auto flex items-center justify-center p-6 text-sm">
              {status === "loading" && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Loading receipt…
                </p>
              )}
              {status === "error" && <p className="text-destructive">This receipt could not be loaded.</p>}
              {status === "empty" && <p className="text-muted-foreground">No receipt is attached to this claim.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

