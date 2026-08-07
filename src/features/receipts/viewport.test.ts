import { describe, expect, it } from "vitest";
import {
  MAX_SCALE,
  MIN_SCALE,
  PAN_MARGIN,
  ZOOM_STEP,
  ariaScrollMetrics,
  clampPan,
  estimateContentSize,
  fitScale,
  initialPan,
  nextScale,
  panFromThumb,
  scrollbarThumb,
  zoomWithAnchor,
} from "./viewport";

function pagePointAt(pan: { x: number; y: number }, anchor: { x: number; y: number }, scale: number) {
  return {
    x: (anchor.x - pan.x) / scale,
    y: (anchor.y - pan.y) / scale,
  };
}

describe("clampPan", () => {
  it("lets a page smaller than the viewport slide freely but never leave it, on both axes", () => {
    const viewport = { w: 494, h: 232 };
    const content = { w: 200, h: 200 };

    expect(clampPan({ x: 100, y: -20 }, viewport, content)).toEqual({ x: 100, y: -20 });

    const topLeft = clampPan({ x: -10000, y: -10000 }, viewport, content);
    expect(topLeft).toEqual({ x: PAN_MARGIN - content.w, y: PAN_MARGIN - content.h });

    const bottomRight = clampPan({ x: 10000, y: 10000 }, viewport, content);
    expect(bottomRight).toEqual({ x: viewport.w - PAN_MARGIN, y: viewport.h - PAN_MARGIN });

    const xClamped = clampPan({ x: 10000, y: -20 }, viewport, content);
    expect(xClamped.x).toBe(viewport.w - PAN_MARGIN);
    expect(xClamped.y).toBe(-20);

    const yClamped = clampPan({ x: 100, y: -10000 }, viewport, content);
    expect(xClamped.y).toBeGreaterThan(-10000);
    expect(yClamped.x).toBe(100);
    expect(yClamped.y).toBe(PAN_MARGIN - content.h);
  });

  it("allows sweeping the full page when the page is larger than the viewport", () => {
    const viewport = { w: 494, h: 232 };
    const content = { w: 900, h: 600 };

    expect(clampPan({ x: 0, y: 0 }, viewport, content)).toEqual({ x: 0, y: 0 });

    expect(clampPan({ x: 10000, y: 10000 }, viewport, content)).toEqual({
      x: viewport.w - PAN_MARGIN,
      y: viewport.h - PAN_MARGIN,
    });

    expect(clampPan({ x: -10000, y: -10000 }, viewport, content)).toEqual({
      x: PAN_MARGIN - content.w,
      y: PAN_MARGIN - content.h,
    });
  });

  it("honours an explicit margin instead of the default", () => {
    const viewport = { w: 494, h: 232 };
    const content = { w: 200, h: 200 };

    expect(clampPan({ x: 10000, y: 10000 }, viewport, content, 0)).toEqual({ x: viewport.w, y: viewport.h });
    expect(clampPan({ x: -10000, y: -10000 }, viewport, content, 24)).toEqual({ x: 24 - content.w, y: 24 - content.h });
  });
});

describe("fitScale", () => {
  it("scales a page smaller than the viewport up so it fills the viewer", () => {
    expect(fitScale({ w: 484, h: 619 }, { w: 200, h: 200 })).toBeCloseTo(2.42);
  });

  it("scales a page larger than the viewport down", () => {
    const viewport = { w: 484, h: 619 };
    const page = { w: 612, h: 792 };

    expect(fitScale(viewport, page)).toBeCloseTo(0.7814, 3);
    expect(fitScale(viewport, page) * 612).toBeLessThanOrEqual(viewport.w);
    expect(fitScale(viewport, page) * 792).toBeLessThanOrEqual(viewport.h);
  });

  it("picks the binding axis for a wide page so height never overflows", () => {
    expect(fitScale({ w: 484, h: 619 }, { w: 900, h: 300 })).toBeCloseTo(484 / 900);
  });

  it("picks the binding axis for a tall page so width never overflows", () => {
    expect(fitScale({ w: 484, h: 619 }, { w: 300, h: 900 })).toBeCloseTo(619 / 900);
  });

  it("preserves the aspect ratio: never stretched, and always the largest scale that fits both axes", () => {
    const viewport = { w: 484, h: 619 };
    const page = { w: 400, h: 250 };
    const scale = fitScale(viewport, page);

    expect(scale).toBeCloseTo(484 / 400);
    expect(scale * page.w).toBeLessThanOrEqual(viewport.w);
    expect(scale * page.h).toBeLessThanOrEqual(viewport.h);
    expect((scale * page.w) / (scale * page.h)).toBeCloseTo(page.w / page.h);
    expect(scale).toBeCloseTo(Math.min(viewport.w / page.w, viewport.h / page.h));
  });

  it("clamps at MAX_SCALE for pages small enough that fit would exceed it", () => {
    expect(fitScale({ w: 484, h: 619 }, { w: 10, h: 10 })).toBe(MAX_SCALE);
  });

  it("clamps at MIN_SCALE for pages large enough that fit would drop below it", () => {
    expect(fitScale({ w: 484, h: 619 }, { w: 10000, h: 10000 })).toBe(MIN_SCALE);
  });

  it("re-evaluates fit scale when container expands from drawer width to full width", () => {
    const page = { w: 612, h: 792 };
    const narrowViewport = { w: 560, h: 800 };
    const expandedViewport = { w: 1040, h: 800 };

    const narrowFit = fitScale(narrowViewport, page);
    const expandedFit = fitScale(expandedViewport, page);

    expect(narrowFit).toBeCloseTo(560 / 612, 3);
    expect(expandedFit).toBeCloseTo(800 / 792, 3);
    expect(expandedFit).toBeGreaterThan(narrowFit);
  });
});

describe("estimateContentSize", () => {
  it("calculates rounded content dimensions based on base page size and target scale", () => {
    const basePage = { w: 612, h: 792 };
    expect(estimateContentSize(basePage, 1.25)).toEqual({ w: 765, h: 990 });
    expect(estimateContentSize(basePage, 0.5)).toEqual({ w: 306, h: 396 });
  });

  it("keeps scrollbar content bounds synchronized with scale changes", () => {
    const basePage = { w: 400, h: 500 };
    const scale1 = 1.0;
    const scale2 = 1.5;

    const content1 = estimateContentSize(basePage, scale1);
    const content2 = estimateContentSize(basePage, scale2);

    expect(content2.w).toBe(Math.round(content1.w * 1.5));
    expect(content2.h).toBe(Math.round(content1.h * 1.5));
  });
});

describe("initialPan", () => {
  it("places the page at top-center: horizontally centered, top flush with the viewer", () => {
    expect(initialPan({ w: 494, h: 232 }, { w: 200, h: 200 })).toEqual({ x: 147, y: 0 });
  });

  it("keeps the top flush when the page is larger than the viewport", () => {
    expect(initialPan({ w: 494, h: 232 }, { w: 900, h: 600 })).toEqual({ x: -203, y: 0 });
  });
});

describe("zoomWithAnchor", () => {
  const pan = { x: 100, y: -40 };
  const anchor = { x: 250, y: 210 };

  it("keeps the page point under the anchor fixed when zooming in", () => {
    const before = pagePointAt(pan, anchor, 1);
    const next = zoomWithAnchor(pan, 1, 2.5, anchor);
    const after = pagePointAt(next, anchor, 2.5);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("keeps the page point under the anchor fixed when zooming out", () => {
    const before = pagePointAt(pan, anchor, 2);
    const next = zoomWithAnchor(pan, 2, 0.5, anchor);
    const after = pagePointAt(next, anchor, 0.5);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("keeps the page point fixed for a fractional anchor on both axes", () => {
    const anchorAtCorner = { x: 37, y: 912 };
    const before = pagePointAt(pan, anchorAtCorner, 1.5);
    const next = zoomWithAnchor(pan, 1.5, 1.75, anchorAtCorner);
    const after = pagePointAt(next, anchorAtCorner, 1.75);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("returns raw values without clamping or rounding", () => {
    const next = zoomWithAnchor(pan, 1, 2, anchor);
    expect(next).toEqual({ x: -50, y: -290 });
  });
});

describe("nextScale", () => {
  it("steps by ZOOM_STEP in either direction", () => {
    expect(nextScale(1, 1)).toBe(1.25);
    expect(nextScale(1, -1)).toBe(0.75);
    expect(nextScale(1, 4)).toBe(2);
  });

  it("never exceeds MAX_SCALE", () => {
    expect(nextScale(MAX_SCALE, 1)).toBe(MAX_SCALE);
    expect(nextScale(1.5, 100)).toBe(MAX_SCALE);
  });

  it("never drops below MIN_SCALE", () => {
    expect(nextScale(MIN_SCALE, -1)).toBe(MIN_SCALE);
    expect(nextScale(1.5, -100)).toBe(MIN_SCALE);
  });

  it("keeps stepping on from an in-between scale", () => {
    expect(nextScale(1.1, 1)).toBe(Math.round(1.1 / ZOOM_STEP + 1) * ZOOM_STEP);
  });
});

describe("scrollbarThumb", () => {
  const viewport = { w: 400, h: 300 };
  const content = { w: 200, h: 200 };
  const track = { w: 400, h: 300 };
  const margin = PAN_MARGIN;

  const expectedSizeX = (track.w * viewport.w) / (viewport.w + viewport.w + content.w - 2 * margin);
  const expectedSizeY =
    (track.h * viewport.h) / (viewport.h + viewport.h + content.h - 2 * margin);

  it("shows a small thumb when the page is much larger than the viewport", () => {
    const large = scrollbarThumb(
      { w: 400, h: 300 },
      { w: 900, h: 600 },
      { x: 0, y: 0 },
      margin,
      track
    );

    expect(large.sizeX).toBeCloseTo((400 * 400) / (400 + 400 + 900 - 96), 5);
    expect(large.sizeY).toBeCloseTo((300 * 300) / (300 + 300 + 600 - 96), 5);
    expect(large.sizeX).toBeLessThan(expectedSizeX);
    expect(large.sizeY).toBeLessThan(expectedSizeY);
  });

  it("sizes each thumb as the visible share of the total pan travel", () => {
    const thumb = scrollbarThumb(viewport, content, { x: 0, y: 0 }, margin, track);

    expect(thumb.sizeX).toBeCloseTo(expectedSizeX, 5);
    expect(thumb.sizeY).toBeCloseTo(expectedSizeY, 5);
  });

  it("places the thumb at offset 0 at max pan (top/left) and at track end (travel) at min pan (bottom/right)", () => {
    const maxPan = scrollbarThumb(viewport, content, { x: 352, y: 252 }, margin, track);
    expect(maxPan.offsetX).toBe(0);
    expect(maxPan.offsetY).toBe(0);

    const minPan = scrollbarThumb(viewport, content, { x: -152, y: -152 }, margin, track);
    expect(minPan.offsetX).toBeCloseTo(track.w - expectedSizeX, 5);
    expect(minPan.offsetY).toBeCloseTo(track.h - expectedSizeY, 5);
  });

  it("maps a mid-range pan to the middle of the travel, on both axes", () => {
    const thumb = scrollbarThumb(viewport, content, { x: 100, y: 50 }, margin, track);

    expect(thumb.offsetX).toBeCloseTo((track.w - expectedSizeX) / 2, 5);
    expect(thumb.offsetY).toBeCloseTo((track.h - expectedSizeY) / 2, 5);
  });

  it("clamps a pan past the bounds to the corresponding track ends", () => {
    const over = scrollbarThumb(viewport, content, { x: 10000, y: -10000 }, margin, track);
    expect(over.offsetX).toBe(0);
    expect(over.offsetY).toBeCloseTo(track.h - expectedSizeY, 5);
  });

  it("handles each axis independently when the page is wider than tall", () => {
    const thumb = scrollbarThumb(viewport, { w: 500, h: 100 }, { x: 0, y: 0 }, margin, track);

    expect(thumb.sizeX).toBeCloseTo((400 * 400) / (400 + 400 + 500 - 96), 5);
    expect(thumb.sizeY).toBeCloseTo((300 * 300) / (300 + 300 + 100 - 96), 5);
  });

  it("uses the track length passed in (bars are inset from the viewport edges)", () => {
    const insetTrack = { w: 380, h: 280 };
    const thumb = scrollbarThumb(viewport, content, { x: 0, y: 0 }, margin, insetTrack);

    expect(thumb.sizeX).toBeCloseTo((380 * 400) / (400 + 504), 5);
    expect(thumb.sizeY).toBeCloseTo((280 * 300) / (300 + 404), 5);
  });
});

describe("panFromThumb", () => {
  const viewport = { w: 400, h: 300 };
  const content = { w: 200, h: 200 };
  const track = { w: 400, h: 300 };
  const margin = PAN_MARGIN;

  it("inverts scrollbarThumb for an in-range pan on both axes", () => {
    const pan = { x: 100, y: 50 };
    const thumb = scrollbarThumb(viewport, content, pan, margin, track);
    const roundTrip = panFromThumb(thumb, viewport, content, margin, track);

    expect(roundTrip.x).toBeCloseTo(pan.x, 5);
    expect(roundTrip.y).toBeCloseTo(pan.y, 5);
  });

  it("maps thumb offset 0 to max pan (top/left) and travel to min pan (bottom/right)", () => {
    const thumb = scrollbarThumb(viewport, content, { x: 0, y: 0 }, margin, track);
    const travel = {
      x: track.w - thumb.sizeX,
      y: track.h - thumb.sizeY,
    };

    const maxPan = panFromThumb({ offsetX: 0, offsetY: 0 }, viewport, content, margin, track);
    expect(maxPan).toEqual({ x: viewport.w - margin, y: viewport.h - margin });

    const minPan = panFromThumb(
      { offsetX: travel.x, offsetY: travel.y },
      viewport,
      content,
      margin,
      track
    );
    expect(minPan.x).toBeCloseTo(margin - content.w, 5);
    expect(minPan.y).toBeCloseTo(margin - content.h, 5);
  });

  it("clamps thumb offsets dragged past a track end", () => {
    const thumb = scrollbarThumb(viewport, content, { x: 0, y: 0 }, margin, track);
    const travel = {
      x: track.w - thumb.sizeX,
      y: track.h - thumb.sizeY,
    };

    const over = panFromThumb(
      { offsetX: travel.x + 500, offsetY: -500 },
      viewport,
      content,
      margin,
      track
    );
    expect(over.x).toBe(margin - content.w);
    expect(over.y).toBe(viewport.h - margin);
  });

  it("inverts scrollbarThumb for an out-of-range pan (clamped on the way in)", () => {
    const pan = { x: 10000, y: -10000 };
    const thumb = scrollbarThumb(viewport, content, pan, margin, track);
    const roundTrip = panFromThumb(thumb, viewport, content, margin, track);

    expect(roundTrip).toEqual({ x: viewport.w - margin, y: margin - content.h });
  });
});

describe("ariaScrollMetrics", () => {
  const viewportDim = 400;
  const contentDim = 200;
  const margin = PAN_MARGIN;
  const maxPan = viewportDim - margin; // 352
  const minPan = margin - contentDim; // -152
  const range = maxPan - minPan; // 504

  it("starts aria-valuenow at 0 when pan is at maxPan (top/left)", () => {
    const metrics = ariaScrollMetrics(viewportDim, contentDim, maxPan, margin);
    expect(metrics.min).toBe(0);
    expect(metrics.max).toBe(Math.round(range));
    expect(metrics.now).toBe(0);
  });

  it("scales aria-valuenow up to range when pan is at minPan (bottom/right)", () => {
    const metrics = ariaScrollMetrics(viewportDim, contentDim, minPan, margin);
    expect(metrics.min).toBe(0);
    expect(metrics.max).toBe(Math.round(range));
    expect(metrics.now).toBe(Math.round(range));
  });

  it("returns proportional aria-valuenow for mid-range pan", () => {
    const midPan = (maxPan + minPan) / 2; // 100
    const metrics = ariaScrollMetrics(viewportDim, contentDim, midPan, margin);
    expect(metrics.now).toBe(Math.round(range / 2));
  });
});

