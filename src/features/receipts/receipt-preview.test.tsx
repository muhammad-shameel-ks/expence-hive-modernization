// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RECEIPT_SIZE_BYTES } from "@/features/expenses/receipt-file-validation";
import { ReceiptPreview } from "./receipt-preview";

// The base (scale = 1) page size pdf.js reports for every loaded document in
// these tests. Chosen so fitScale produces distinct, easy-to-check
// percentages for the viewport sizes used below.
const BASE_PAGE = { width: 600, height: 800 };

// Every loading task the mocked pdf.js creates, recorded so tests can assert
// on destroy() after a source switch or unmount. Setting rejectWith makes the
// next getDocument() call fail, exercising the invalid-pdf error path.
const pdfjsState = vi.hoisted(() => ({
  tasks: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
  rejectWith: null as Error | null,
}));

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
    getDocument: vi.fn(() => {
      const task = {
        promise: pdfjsState.rejectWith ? Promise.reject(pdfjsState.rejectWith) : Promise.resolve(pdf),
        destroy: vi.fn(),
      };
      pdfjsState.rejectWith = null;
      pdfjsState.tasks.push(task);
      return task;
    }),
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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resizeCallbacks = [];
  pdfjsState.tasks.length = 0;
  pdfjsState.rejectWith = null;
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  fetchMock = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  }));
  vi.stubGlobal("fetch", fetchMock);
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
    expect(screen.queryByText(/loading receipt/i)).toBeNull();
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

describe("ReceiptPreview close control", () => {
  it("exposes the accessible close button through its ref", () => {
    const closeButtonRef = createRef<HTMLButtonElement>();
    render(<ReceiptPreview claimId="claim-1" onClose={vi.fn()} ref={closeButtonRef} />);

    const closeButton = screen.getByRole("button", { name: "Close receipt preview" });
    expect(closeButtonRef.current).toBe(closeButton);
  });
});

describe("ReceiptPreview wheel pan and zoom", () => {
  it("pans the page on plain wheel and does not zoom", async () => {
    const { container, layer } = await renderAndWaitReady({ w: 800, h: 600 }, { w: 600, h: 800 });
    expect(percentageText()).toBe("75%");
    expect(layer.style.transform).toBe("translate3d(100px, 0px, 0)");

    const event = new WheelEvent("wheel", {
      deltaY: 60, // plain wheel scrolls the page content, not the zoom
      clientX: 10,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      container.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(percentageText()).toBe("75%");
    expect(layer.style.transform).toBe("translate3d(100px, -60px, 0)");
  });

  it("pans horizontally from wheel deltaX (trackpad swipes)", async () => {
    const { container, layer } = await renderAndWaitReady({ w: 800, h: 600 }, { w: 600, h: 800 });
    expect(layer.style.transform).toBe("translate3d(100px, 0px, 0)");

    const event = new WheelEvent("wheel", {
      deltaX: -40, // swipe right moves the view right
      clientX: 10,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      container.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(layer.style.transform).toBe("translate3d(140px, 0px, 0)");
  });

  it("lets plain wheel fall through to the surrounding container once the pan is at its bound", async () => {
    const { container } = await renderAndWaitReady({ w: 800, h: 600 }, { w: 600, h: 800 });

    // Drive the pan to its lower vertical bound: content is 600 tall in a
    // 600 tall viewport with a 48px margin, so a single large delta pins it.
    const driveEvent = new WheelEvent("wheel", {
      deltaY: 10000,
      clientX: 10,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      container.dispatchEvent(driveEvent);
    });
    expect(driveEvent.defaultPrevented).toBe(true);

    // One more in the same direction: nothing left to pan, so the event is
    // left unprevented and the drawer/form scroll receives it.
    const fallThroughEvent = new WheelEvent("wheel", {
      deltaY: 10000,
      clientX: 10,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      container.dispatchEvent(fallThroughEvent);
    });

    expect(fallThroughEvent.defaultPrevented).toBe(false);
  });

  it("zooms with Ctrl/Cmd + wheel toward the cursor", async () => {
    const { container } = await renderAndWaitReady({ w: 800, h: 600 }, { w: 600, h: 800 });
    expect(percentageText()).toBe("75%");

    const event = new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: -100, // negative deltaY = zoom in
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
      expect(percentageText()).toBe("100%");
    });
  });

  it("always prevents Ctrl/Cmd + wheel over the viewer, even at a scale bound, so browser page zoom never fires", async () => {
    // A tiny 100x100 viewport against the 150x200 base page fits at 0.125,
    // clamped to MIN_SCALE (0.25) -> the viewer opens already at the floor.
    const { container } = await renderAndWaitReady({ w: 100, h: 100 }, { w: 150, h: 200 });
    expect(percentageText()).toBe("25%");

    const event = new WheelEvent("wheel", {
      ctrlKey: true,
      deltaY: 100, // positive deltaY = zoom out, already at the floor
      clientX: 10,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      container.dispatchEvent(event);
    });

    // preventDefault still fires: Ctrl+wheel over the viewer must never fall
    // through to the browser's page zoom, even with nothing to zoom.
    expect(event.defaultPrevented).toBe(true);
    expect(percentageText()).toBe("25%");
  });
});

describe("ReceiptPreview local file mode", () => {
  function makeFile(name = "receipt.pdf", size = 4, type = "application/pdf") {
    return new File([new Uint8Array(size)], name, { type });
  }

  async function renderFileAndWaitReady(
    file: File,
    viewport: { w: number; h: number },
    content: { w: number; h: number }
  ) {
    const utils = render(<ReceiptPreview file={file} fileName={file.name} />);
    const container = screen.getByRole("region");
    const layer = container.firstElementChild as HTMLElement;
    mockSize(container, { clientWidth: viewport.w, clientHeight: viewport.h });
    mockSize(layer, { offsetWidth: content.w, offsetHeight: content.h });

    await waitFor(() => {
      expect(container.querySelector("canvas")).not.toBeNull();
      expect(screen.queryByText(/loading receipt/i)).toBeNull();
    });

    return { ...utils, container, layer };
  }

  it("renders a valid local file through the pdf pipeline and fits it on open", async () => {
    const { container } = await renderFileAndWaitReady(
      makeFile("receipt.pdf"),
      { w: 800, h: 600 },
      { w: 600, h: 800 }
    );

    expect(percentageText()).toBe("75%");
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(pdfjsState.tasks).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a file that exceeds the size cap with the error state", async () => {
    render(<ReceiptPreview file={makeFile("big.pdf", MAX_RECEIPT_SIZE_BYTES + 1)} />);

    await waitFor(() => {
      expect(screen.getByText("This receipt could not be loaded.")).toBeInTheDocument();
    });
    expect(pdfjsState.tasks).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the error state when the file bytes are not a valid pdf", async () => {
    pdfjsState.rejectWith = new Error("Invalid PDF structure");
    render(<ReceiptPreview file={makeFile("bad.pdf")} />);
    const container = screen.getByRole("region");

    await waitFor(() => {
      expect(screen.getByText("This receipt could not be loaded.")).toBeInTheDocument();
    });
    expect(container.querySelector("canvas")).toBeNull();
    expect(pdfjsState.tasks[0].destroy).not.toHaveBeenCalled();
  });

  it("destroys the previous document and reloads when the file changes", async () => {
    const { rerender } = await renderFileAndWaitReady(
      makeFile("a.pdf"),
      { w: 800, h: 600 },
      { w: 600, h: 800 }
    );
    expect(pdfjsState.tasks).toHaveLength(1);

    rerender(<ReceiptPreview file={makeFile("b.pdf")} />);
    const container = screen.getByRole("region");

    await waitFor(() => {
      expect(pdfjsState.tasks).toHaveLength(2);
      expect(container.querySelector("canvas")).not.toBeNull();
      expect(screen.queryByText(/loading receipt/i)).toBeNull();
    });

    expect(pdfjsState.tasks[0].destroy).toHaveBeenCalledTimes(1);
    expect(pdfjsState.tasks[1].destroy).not.toHaveBeenCalled();
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("destroys the cached document when unmounted", async () => {
    const { unmount } = await renderFileAndWaitReady(
      makeFile("receipt.pdf"),
      { w: 800, h: 600 },
      { w: 600, h: 800 }
    );
    expect(pdfjsState.tasks[0].destroy).not.toHaveBeenCalled();

    unmount();
    expect(pdfjsState.tasks[0].destroy).toHaveBeenCalledTimes(1);
  });
});
