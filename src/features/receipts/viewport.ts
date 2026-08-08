export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export const PAN_MARGIN = 48;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;
export const ZOOM_STEP = 0.25;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampPan(pan: Point, viewport: Size, content: Size, margin = PAN_MARGIN): Point {
  return {
    x: clamp(pan.x, margin - content.w, viewport.w - margin),
    y: clamp(pan.y, margin - content.h, viewport.h - margin),
  };
}

export function fitScale(viewport: Size, page: Size): number {
  return clamp(
    Math.min(viewport.w / page.w, viewport.h / page.h),
    MIN_SCALE,
    MAX_SCALE
  );
}

export function estimateContentSize(basePageSize: Size, scale: number): Size {
  return {
    w: Math.round(basePageSize.w * scale),
    h: Math.round(basePageSize.h * scale),
  };
}

export function initialPan(viewport: Size, content: Size): Point {
  // Top-center: horizontally centered, page top flush with the viewer top.
  return {
    x: (viewport.w - content.w) / 2,
    y: 0,
  };
}

export function zoomWithAnchor(
  pan: Point,
  oldScale: number,
  newScale: number,
  anchor: Point
): Point {
  const pagePoint = {
    x: (anchor.x - pan.x) / oldScale,
    y: (anchor.y - pan.y) / oldScale,
  };
  return {
    x: anchor.x - pagePoint.x * newScale,
    y: anchor.y - pagePoint.y * newScale,
  };
}

export function nextScale(current: number, step: number): number {
  const zoomed = Math.round(current / ZOOM_STEP + step) * ZOOM_STEP;
  return clamp(zoomed, MIN_SCALE, MAX_SCALE);
}

export interface ScrollbarThumb {
  sizeX: number;
  offsetX: number;
  sizeY: number;
  offsetY: number;
}

// Shared per-axis scrollbar math: the pan range along an axis is
// [margin - contentDim, viewportDim - margin], the thumb length is the
// visible share of the total travel (viewport / (viewport + range)), and
// travel is the distance the thumb can move within the track.
function axisScrollbarMetrics(
  viewportDim: number,
  contentDim: number,
  margin: number,
  trackLength: number
): { minPan: number; maxPan: number; rangeLength: number; size: number; travel: number } {
  const minPan = margin - contentDim;
  const maxPan = viewportDim - margin;
  const rangeLength = maxPan - minPan;
  const size =
    rangeLength <= 0 ? trackLength : (trackLength * viewportDim) / (viewportDim + rangeLength);
  return { minPan, maxPan, rangeLength, size, travel: trackLength - size };
}

export function scrollbarThumb(
  viewport: Size,
  content: Size,
  pan: Point,
  margin: number,
  track: Size
): ScrollbarThumb {
  const clamped = clampPan(pan, viewport, content, margin);
  const perAxis = (dim: "w" | "h", axis: "x" | "y") => {
    const metrics = axisScrollbarMetrics(viewport[dim], content[dim], margin, track[dim]);
    const offset =
      metrics.rangeLength <= 0
        ? 0
        : clamp(
            (1 - (clamped[axis] - metrics.minPan) / metrics.rangeLength) * metrics.travel,
            0,
            metrics.travel
          );
    return { size: metrics.size, offset };
  };
  const x = perAxis("w", "x");
  const y = perAxis("h", "y");
  return { sizeX: x.size, offsetX: x.offset, sizeY: y.size, offsetY: y.offset };
}

// Inverse of scrollbarThumb: given the thumb offsets (px along the tracks),
// return the pan those offsets map to. Out-of-range offsets are clamped, so
// dragging a thumb past a track end just pins the pan at its bound.
export function panFromThumb(
  thumb: { offsetX: number; offsetY: number },
  viewport: Size,
  content: Size,
  margin: number,
  track: Size
): Point {
  const perAxis = (dim: "w" | "h", offset: number): number => {
    const metrics = axisScrollbarMetrics(viewport[dim], content[dim], margin, track[dim]);
    if (metrics.rangeLength <= 0 || metrics.travel <= 0) return metrics.maxPan;
    return (
      metrics.maxPan - (clamp(offset, 0, metrics.travel) / metrics.travel) * metrics.rangeLength
    );
  };
  return {
    x: perAxis("w", thumb.offsetX),
    y: perAxis("h", thumb.offsetY),
  };
}

export interface AriaScrollMetrics {
  min: number;
  max: number;
  now: number;
}

export function ariaScrollMetrics(
  viewportDim: number,
  contentDim: number,
  pan: number,
  margin = PAN_MARGIN
): AriaScrollMetrics {
  const minPan = margin - contentDim;
  const maxPan = viewportDim - margin;
  const range = maxPan - minPan;
  const max = Math.round(Math.max(0, range));
  const clampedPan = clamp(pan, minPan, maxPan);
  const now = Math.round(clamp(maxPan - clampedPan, 0, max));
  return { min: 0, max, now };
}
