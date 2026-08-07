// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptPreview } from "./receipt-preview";

// The base (scale = 1) page size pdf.js reports for every loaded document in
// these tests. Chosen so fitScale produces distinct, easy-to-check
// percentages for the viewport sizes used below.
const BASE_PAGE = { width: 600, height: 800 };

vi.mock("pdfjs-dist", () => {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: BASE_PAGE.width * scale,
      height: BASE_PAGE.height * scale,
    }),
    cleanup: vi.fn(),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
  };
  const pdf = { numPages: 1, getPage: vi.fn(async () => page) };
  return {
    GlobalWorkerOptions: {},
    getDocument: vi.fn(() => ({ promise: Promise.resolve(pdf), destroy: vi.fn() })),
  };
});

// jsdom has no layout engine, so clientWidth/clientHeight/offsetWidth/
// offsetHeight are always 0. The component reads these directly (by design -
// it must not depend on a layout library), so tests stub them per element.
function mockSize(
  el: Element,
  dims: Partial<{ clientWidth: number; clientHeight: number; offsetWidth: number; offsetHeight: number }>
) {
  for (const [key, value] of Object.entries(dims)) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
}

// jsdom does not implement ResizeObserver. This stub records every callback
// registered via `new ResizeObserver(cb)` so tests can fire them on demand to
// simulate a container/layer resize, exactly like the real browser would
// after a drawer expand/collapse or a viewport breakpoint change.
let resizeCallbacks: ResizeObserverCallback[] = [];
class StubResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((cb) => cb !== this.callback);
  }
}

function fireResize() {
  // Snapshot before iterating: invoking a callback can (indirectly, via a
  // re-render) register new observers, and iterating the live array while it
  // grows would never terminate.
  const callbacks = [...resizeCallbacks];
  act(() => {
    for (const cb of callbacks) cb([] as unknown as ResizeObserverEntry[], null as unknown as ResizeObserver);
  });
}

beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderAndWaitReady(viewport: { w: number; h: number }, content: { w: number; h: number }) {
  render(<ReceiptPreview claimId="claim-1" />);
  const container = screen.getByRole("region");
  const layer = container.firstElementChild as HTMLElement;
  mockSize(container, { clientWidth: viewport.w, clientHeight: viewport.h });
  mockSize(layer, { offsetWidth: content.w, offsetHeight: content.h });

  await waitFor(() => {
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  return { container, layer };
}

function percentageText() {
  return screen.getByLabelText(/reset zoom/i).textContent;
}

describe("ReceiptPreview fit-on-open and resize re-fit", () => {
  it("fits the freshly loaded page to the container (populates basePageSizeRef)", async () => {
    // viewport 800x600 vs base page 600x800 -> fitScale = min(800/600, 600/800) = 0.75.
    // This only happens if the base page size captured on load is available
    // to fitScale; before the fix it was always null and the component
    // rendered at scale 1 (100%) instead.
    await renderAndWaitReady({ w: 800, h: 600 }, { w: 600, h: 800 });
    expect(percentageText()).toBe("75%");
  });

  it("re-fits the scale when the container resizes and the user has not zoomed", async () => {
    const { container, layer } = await renderAndWaitReady({ w: 800, h: 600 }, { w: 600, h: 800 });
    expect(percentageText()).toBe("75%");

    // Simulate a drawer expansion / breakpoint change growing the container.
    // fitScale(1200x1200, 600x800) = min(2, 1.5) = 1.5 -> 150%.
    mockSize(container, { clientWidth: 1200, clientHeight: 1200 });
    mockSize(layer, { offsetWidth: 900, offsetHeight: 1200 });
    fireResize();

    await waitFor(() => {
      expect(percentageText()).toBe("150%");
    });
  });

  it("does not re-fit after the user has manually zoomed", async () => {
    const { container, layer } = await renderAndWaitReady({ w: 800, h: 600 }, { w: 600, h: 800 });

    act(() => {
      screen.getByLabelText("Zoom in").click();
    });
    await waitFor(() => {
      expect(percentageText()).toBe("100%");
    });

    mockSize(container, { clientWidth: 1200, clientHeight: 1200 });
    mockSize(layer, { offsetWidth: 600, offsetHeight: 800 });
    fireResize();

    // No fit re-evaluation should occur once the user has zoomed manually;
    // give any (incorrect) async update a chance to land before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(percentageText()).toBe("100%");
  });
});

describe("ReceiptPreview wheel zoom at scale bounds", () => {
  it("does not preventDefault or change scale/pan when already at MIN_SCALE and scrolling further out", async () => {
    // A tiny 100x100 viewport against the 600x800 base page fits at 0.125,
    // clamped to MIN_SCALE (0.25) -> the viewer opens already at the floor.
    const { container } = await renderAndWaitReady({ w: 100, h: 100 }, { w: 150, h: 200 });
    expect(percentageText()).toBe("25%");

    const event = new WheelEvent("wheel", {
      deltaY: 100, // positive deltaY = zoom out further, already at the floor
      clientX: 10,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      container.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(percentageText()).toBe("25%");
  });

  it("does preventDefault and zooms when the wheel direction moves away from the bound", async () => {
    const { container } = await renderAndWaitReady({ w: 100, h: 100 }, { w: 150, h: 200 });
    expect(percentageText()).toBe("25%");

    const event = new WheelEvent("wheel", {
      deltaY: -100, // negative deltaY = zoom in, away from MIN_SCALE
      clientX: 10,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      container.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(percentageText()).toBe("50%");
    });
  });
});
