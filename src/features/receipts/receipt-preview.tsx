"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { FileText, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_RECEIPT_SIZE_BYTES } from "@/server/expenses/receipt-validation";
import {
  MAX_SCALE,
  MIN_SCALE,
  PAN_MARGIN,
  clampPan,
  fitScale,
  initialPan,
  nextScale,
  panFromThumb,
  scrollbarThumb,
  zoomWithAnchor,
} from "./viewport";
import type { Point, Size } from "./viewport";
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

// The overlay scrollbar tracks sit 6px in from the container edges (matching
// the inset-y/right/bottom classes on the bars below), so the thumb math gets
// the real track length.
const SCROLLBAR_INSET = 6;

function scrollbarTrack(viewport: Size): Size {
  return {
    w: Math.max(0, viewport.w - 2 * SCROLLBAR_INSET),
    h: Math.max(0, viewport.h - 2 * SCROLLBAR_INSET),
  };
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
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  // Latest viewport/content sizes, kept in state because rendering must not
  // read refs directly (react-hooks/refs). Observed live so the scrollbar
  // thumb metrics and the pan bounds track every resize and zoom re-render.
  const [measuredSize, setMeasuredSize] = useState<{ viewport: Size; content: Size } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const documentRef = useRef<CachedDocument | null>(null);
  // Tracks which claim's content the current pan was initialized for, so a
  // fresh claim opens top-center while zoom re-renders keep the pan.
  const panInitializedForRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; pan: Point } | null>(null);
  const viewerId = useId();
  // Latest-state mirrors for the native wheel listener, which stays attached
  // for the lifetime of the viewer and therefore cannot read the state
  // directly (that would force a re-attach on every pan/zoom change).
  const statusRef = useRef<Status>(status);
  const panRef = useRef(pan);
  const scaleRef = useRef(scale);

  // Reset zoom and start from loading when the claim changes, without letting
  // the render effect run twice for one claim change.
  const [previousClaimId, setPreviousClaimId] = useState(claimId);
  if (previousClaimId !== claimId) {
    setPreviousClaimId(claimId);
    setScale(1);
    setStatus("loading");
  }

  // Leaving the ready state invalidates the pan's claim association, so the
  // next loaded content always opens top-center instead of inheriting a
  // stale pan (e.g. after an error, or the same claim reloaded).
  useEffect(() => {
    if (status !== "ready") panInitializedForRef.current = null;
  }, [status]);

  // Keep the refs in lockstep with the state they mirror.
  useEffect(() => {
    statusRef.current = status;
    panRef.current = pan;
    scaleRef.current = scale;
  }, [status, pan, scale]);

  // Measure the viewer viewport and the rendered page layer. Both reads are
  // transform-independent: clientWidth/clientHeight and offsetWidth/offsetHeight.
  const measure = useCallback(() => {
    const container = containerRef.current;
    const layer = innerRef.current;
    if (!container || !layer) return null;
    const viewport = { w: container.clientWidth, h: container.clientHeight };
    const content = { w: layer.offsetWidth, h: layer.offsetHeight };
    if (viewport.w <= 0 || viewport.h <= 0 || content.w <= 0 || content.h <= 0) {
      return null;
    }
    return { viewport, content };
  }, []);

  // Reconcile the pan with the current viewport/content sizes: either reset
  // to the initial top-center position, or just clamp the existing pan so
  // the page can never leave the view entirely.
  const reconcilePan = useCallback(
    (initialize: boolean) => {
      const measured = measure();
      if (!measured) return;
      const { viewport, content } = measured;
      setPan((current) =>
        initialize
          ? clampPan(initialPan(viewport, content), viewport, content)
          : clampPan(current, viewport, content)
      );
    },
    [measure]
  );

  // Once the ready state has committed, the layer is sized to its content
  // (w-max/h-max) with the canvases appended, so this is the first moment a
  // fresh claim can be measured correctly and placed at top-center. The ref
  // guard makes this run exactly once per claim; the status effect above
  // invalidates it whenever the viewer leaves the ready state, so a later
  // claim (or the same claim again after an error) opens top-center rather
  // than inheriting a stale pan.
  useLayoutEffect(() => {
    if (status !== "ready") return;
    if (panInitializedForRef.current === claimId) return;
    panInitializedForRef.current = claimId;
    reconcilePan(true);
  }, [status, claimId, reconcilePan]);

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

          // A freshly loaded document opens fitted to the viewer (Google
          // Drive style): compute the scale that fits the first page
          // entirely within the viewer, preserving aspect ratio. If the
          // container is not measurable, fall through and render at the
          // current scale. Setting a different scale re-runs this effect
          // (the pdf is now cached in documentRef, so it is not re-fetched)
          // and the next run renders at the fitted scale. This only happens
          // in the fresh-document branch - zoom changes never re-fit.
          try {
            const firstPage = await pdf.getPage(1);
            const baseViewport = firstPage.getViewport({ scale: 1 });
            firstPage.cleanup();
            const containerEl = containerRef.current;
            const containerWidth = containerEl?.clientWidth ?? 0;
            const containerHeight = containerEl?.clientHeight ?? 0;
            if (containerWidth > 0 && containerHeight > 0) {
              const fitted = fitScale(
                { w: containerWidth, h: containerHeight },
                { w: baseViewport.width, h: baseViewport.height }
              );
              if (fitted !== scale) {
                setScale(fitted);
                return;
              }
            }
          } catch {
            // Fall through and render at the current scale.
          }
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
        if (!cancelled) {
          setStatus("ready");
          // The page layer now holds the freshly rendered canvases at the
          // current scale, so re-clamp the pan against the real content size
          // (a zoom re-render may have resized the page). Opening a fresh
          // claim at top-center happens in the layout effect above, after the
          // ready state has committed and the layer is sized to its content.
          reconcilePan(false);
        }
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
  }, [claimId, scale, reconcilePan]);

  // Free the cached document (and its canvases) when the component unmounts.
  useEffect(() => {
    return () => {
      const cached = documentRef.current;
      documentRef.current = null;
      void cached?.task.destroy();
    };
  }, []);

  // Re-clamp the pan when the viewer resizes, so a resized viewer never
  // leaves the page stranded off-screen.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => reconcilePan(false));
    observer.observe(container);
    return () => observer.disconnect();
  }, [reconcilePan]);

  // Mirror the live container and page-layer sizes into state for the
  // scrollbar math (render must not read refs). Both elements are observed:
  // the container resizes with the pane, and the layer resizes when the
  // document finishes loading, a claim switches, or a zoom re-render grows
  // the canvases.
  useEffect(() => {
    const container = containerRef.current;
    const layer = innerRef.current;
    if (!container || !layer) return;

    const update = () => {
      const viewport = { w: container.clientWidth, h: container.clientHeight };
      const content = { w: layer.offsetWidth, h: layer.offsetHeight };
      if (viewport.w <= 0 || viewport.h <= 0 || content.w <= 0 || content.h <= 0) return;
      setMeasuredSize((current) =>
        current &&
        current.viewport.w === viewport.w &&
        current.viewport.h === viewport.h &&
        current.content.w === content.w &&
        current.content.h === content.h
          ? current
          : { viewport, content }
      );
    };

    update();
    const containerObserver = new ResizeObserver(update);
    containerObserver.observe(container);
    const layerObserver = new ResizeObserver(update);
    layerObserver.observe(layer);
    return () => {
      containerObserver.disconnect();
      layerObserver.disconnect();
    };
  }, []);

  // Native wheel handling: React registers onWheel handlers as passive at the
  // root, so preventDefault inside them would silently fail. Attaching the
  // listener directly on the container with { passive: false } allows
  // preventDefault, which keeps the browser from scrolling or zooming the
  // page while the viewer consumes the wheel. The handler reads current state
  // exclusively via the refs above (and measures the DOM live), so it is
  // attached once per mount and never needs re-registration.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      // The wheel only acts on a loaded page; while loading/error/empty the
      // event falls through to the browser untouched.
      if (statusRef.current !== "ready") return;
      const measured = measure();
      if (!measured) return;

      // Both the plain wheel and Ctrl/Cmd + wheel zoom toward the cursor,
      // one ZOOM_STEP per notch, within the same MIN_SCALE/MAX_SCALE bounds
      // as the toolbar. Panning is reserved for drag, touch, and keyboard.
      // zoomWithAnchor returns raw values, so the result is always clamped.
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const newScale = nextScale(scaleRef.current, event.deltaY < 0 ? 1 : -1);
      const nextPan = zoomWithAnchor(
        panRef.current,
        scaleRef.current,
        newScale,
        anchor
      );
      // zoomWithAnchor returns raw values, so the result is clamped here.
      // The refs are written synchronously (not just by the effect below) so
      // rapid successive notches always step from the latest value, even if
      // the render and effect flush later.
      const clampedPan = clampPan(nextPan, measured.viewport, measured.content);
      panRef.current = clampedPan;
      scaleRef.current = newScale;
      setPan(clampedPan);
      setScale(newScale);
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [measure]);

  // Zoom to an explicit scale, keeping the page point under the viewport
  // center stationary (anchored, never content-centered), then clamping.
  function zoomTo(newScale: number) {
    if (newScale === scale) return;
    const measured = measure();
    if (!measured) {
      setScale(newScale);
      return;
    }
    const { viewport, content } = measured;
    const anchor = { x: viewport.w / 2, y: viewport.h / 2 };
    const nextPan = zoomWithAnchor(pan, scale, newScale, anchor);
    setPan(clampPan(nextPan, viewport, content));
    setScale(newScale);
  }

  function zoomBy(step: number) {
    zoomTo(nextScale(scale, step));
  }

  function panBy(deltaX: number, deltaY: number) {
    const measured = measure();
    if (!measured) return;
    setPan((current) =>
      clampPan(
        { x: current.x + deltaX, y: current.y + deltaY },
        measured.viewport,
        measured.content
      )
    );
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "+" || event.key === "=") {
      zoomBy(1);
    } else if (event.key === "-" || event.key === "_") {
      zoomBy(-1);
    } else if (event.key === "0") {
      zoomTo(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      panBy(40, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      panBy(-40, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      panBy(0, 40);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      panBy(0, -40);
    }
  }

  function startPanning(clientX: number, clientY: number) {
    const measured = measure();
    if (!measured) return;
    dragStartRef.current = { x: clientX, y: clientY, pan };
    setIsPanning(true);
  }

  function panDuringDrag(clientX: number, clientY: number) {
    const start = dragStartRef.current;
    if (!start) return;
    const measured = measure();
    if (!measured) return;
    setPan(
      clampPan(
        { x: start.pan.x + clientX - start.x, y: start.pan.y + clientY - start.y },
        measured.viewport,
        measured.content
      )
    );
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    startPanning(e.clientX, e.clientY);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return;
    e.preventDefault();
    panDuringDrag(e.clientX, e.clientY);
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
    const touch = e.touches[0];
    startPanning(touch.clientX, touch.clientY);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!dragStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    panDuringDrag(touch.clientX, touch.clientY);
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
            onClick={() => zoomBy(-1)}
          >
            <ZoomOut />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Reset zoom to 100%"
            disabled={!ready || scale === 1}
            onClick={() => zoomTo(1)}
          >
            <span aria-live="polite">{percentage}%</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={!ready || scale >= MAX_SCALE}
            onClick={() => zoomBy(1)}
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
        id={viewerId}
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
          "relative min-h-48 flex-1 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring/50 select-none touch-none",
          isPanning ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        <div
          ref={innerRef}
          style={
            ready ? { transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` } : undefined
          }
          className={cn(
            "flex flex-col",
            ready ? "h-max w-max gap-3 will-change-transform" : "h-full w-full"
          )}
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
        <Scrollbar
          axis="vertical"
          viewport={measuredSize?.viewport}
          content={measuredSize?.content}
          pan={pan}
          ready={ready}
          controlsId={viewerId}
          onPan={setPan}
        />
        <Scrollbar
          axis="horizontal"
          viewport={measuredSize?.viewport}
          content={measuredSize?.content}
          pan={pan}
          ready={ready}
          controlsId={viewerId}
          onPan={setPan}
        />
      </div>
    </div>
  );
}

// Internal, axis-specific overlay scrollbar. Both bars share the same track
// and thumb rendering, pointer-capture drag, track click-to-jump, and ARIA
// wiring; only the orientation differs. The bars are children of the panning
// container, so every mousedown/touchstart they consume is stopped from
// bubbling into the page drag handlers; wheel is deliberately left to bubble
// to the container's native zoom listener.
function Scrollbar({
  axis,
  viewport,
  content,
  pan,
  ready,
  controlsId,
  onPan,
}: {
  axis: "vertical" | "horizontal";
  viewport?: Size;
  content?: Size;
  pan: Point;
  ready: boolean;
  controlsId: string;
  onPan: (pan: Point) => void;
}) {
  const isVertical = axis === "vertical";
  const dim: "w" | "h" = isVertical ? "h" : "w";
  const track = viewport ? scrollbarTrack(viewport) : null;
  // Thumb metrics derive from the current pan and the observed sizes, so
  // every pan/zoom re-render updates them. Before the first page renders the
  // thumb shows as a dimmed, fixed stub (no pointer events).
  const thumb =
    ready && viewport && content
      ? scrollbarThumb(viewport, content, pan, PAN_MARGIN, track!)
      : null;
  const thumbSize = thumb
    ? isVertical
      ? thumb.sizeY
      : thumb.sizeX
    : (track?.[dim] ?? 0) * 0.4;
  const thumbOffset = thumb ? (isVertical ? thumb.offsetY : thumb.offsetX) : 0;
  const now = thumb ? Math.round(isVertical ? pan.y : pan.x) : 0;
  const min = thumb ? Math.round(PAN_MARGIN - content![dim]) : 0;
  const max = thumb ? Math.round(viewport![dim] - PAN_MARGIN) : 0;

  // Drag state: the pointer that owns the drag, where it started, and the
  // thumb offsets at drag start (so panning follows the pointer delta
  // proportionally, independent of re-renders).
  const dragStartRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // The bars are children of the panning container, so every event they
  // consume must be stopped from bubbling into the page drag handlers.
  function stopScrollbarEvent(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  // Pan the page from a set of thumb offsets (px along the tracks). Track
  // clicks and thumb drags both land here; panFromThumb clamps offsets that
  // fall outside the track, and clampPan pins the result to the pan bounds.
  function panToThumbOffsets(offsets: { offsetX: number; offsetY: number }) {
    if (!viewport || !content) return;
    onPan(
      clampPan(
        panFromThumb(
          offsets,
          viewport,
          content,
          PAN_MARGIN,
          scrollbarTrack(viewport)
        ),
        viewport,
        content
      )
    );
  }

  function handleThumbPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!ready || !viewport || !content) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const thumbMetrics = scrollbarThumb(viewport, content, pan, PAN_MARGIN, track!);
    dragStartRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX: thumbMetrics.offsetX,
      offsetY: thumbMetrics.offsetY,
    };
  }

  function handleThumbPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    e.stopPropagation();
    panToThumbOffsets({
      offsetX: start.offsetX + (e.clientX - start.clientX),
      offsetY: start.offsetY + (e.clientY - start.clientY),
    });
  }

  function handleThumbPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStartRef.current?.pointerId !== e.pointerId) return;
    dragStartRef.current = null;
  }

  // Clicking the track jumps the thumb so its center lands at the cursor.
  // Fired on pointerup (not click) so a thumb drag that ends over the track
  // never also jumps: the thumb holds pointer capture, retargeting its
  // pointerup away from the track.
  function handleTrackPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!ready || !viewport || !content) return;
    const thumbMetrics = scrollbarThumb(viewport, content, pan, PAN_MARGIN, track!);
    const rect = e.currentTarget.getBoundingClientRect();
    const position = isVertical ? e.clientY - rect.top : e.clientX - rect.left;
    const jumpSize = isVertical ? thumbMetrics.sizeY : thumbMetrics.sizeX;
    panToThumbOffsets({
      offsetX: isVertical ? thumbMetrics.offsetX : position - jumpSize / 2,
      offsetY: isVertical ? position - jumpSize / 2 : thumbMetrics.offsetY,
    });
  }

  return (
    <div
      className={cn(
        "absolute rounded-full bg-foreground/10",
        isVertical ? "inset-y-1.5 right-1.5 w-2.5" : "bottom-1.5 left-1.5 right-1.5 h-2.5"
      )}
      onMouseDown={stopScrollbarEvent}
      onTouchStart={stopScrollbarEvent}
      onPointerUp={handleTrackPointerUp}
    >
      <div
        role="scrollbar"
        aria-orientation={axis}
        aria-controls={controlsId}
        aria-valuenow={now}
        aria-valuemin={min}
        aria-valuemax={max}
        onPointerDown={handleThumbPointerDown}
        onPointerMove={handleThumbPointerMove}
        onPointerUp={handleThumbPointerEnd}
        onPointerCancel={handleThumbPointerEnd}
        onClick={stopScrollbarEvent}
        onMouseDown={stopScrollbarEvent}
        onTouchStart={stopScrollbarEvent}
        className={cn(
          "absolute rounded-full",
          isVertical ? "left-0 w-full" : "top-0 h-full",
          ready
            ? "cursor-grab bg-foreground/30 hover:bg-foreground/40"
            : "pointer-events-none bg-foreground/15"
        )}
        style={
          isVertical
            ? { top: thumbOffset, height: thumbSize }
            : { left: thumbOffset, width: thumbSize }
        }
      />
    </div>
  );
}
