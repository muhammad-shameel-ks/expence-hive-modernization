// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseCreateForm, type ExpenseDraftInitial } from "./expense-create-form";

// jsdom does not implement Element.prototype.scrollIntoView, so tests install
// a recorder and assert on the calls it received.
const scrollIntoViewMock = vi.fn();

// The wizard embeds the real pdf viewer; these tests only assert on the mount
// point and the source props, so ReceiptPreview is replaced with a recorder
// that also renders the viewer's close control when onClose is provided.
const receiptPreviewCalls = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
  mounts: 0,
  unmounts: 0,
  sourceLoads: 0,
}));

vi.mock("@/features/receipts/receipt-preview", () => ({
  ReceiptPreview: forwardRef<HTMLButtonElement, {
    file?: File;
    claimId?: string;
    fileName?: string;
    onClose?: () => void;
  }>(function ReceiptPreviewMock(props, closeButtonRef) {
    receiptPreviewCalls.props.push({ ...props });
    useEffect(() => {
      receiptPreviewCalls.mounts += 1;
      return () => {
        receiptPreviewCalls.unmounts += 1;
      };
    }, []);
    useEffect(() => {
      receiptPreviewCalls.sourceLoads += 1;
    }, [props.file, props.claimId]);
    return (
      <div data-testid="receipt-preview">
        {props.onClose ? (
          <button
            ref={closeButtonRef}
            type="button"
            data-testid="receipt-preview-close"
            aria-label="Dismiss receipt preview"
            onClick={props.onClose}
          >
            Close
          </button>
        ) : null}
      </div>
    );
  }),
}));

function stubFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ claim: { id: "exp-1" } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// jsdom has no layout engine, so getBoundingClientRect always reports 0,0.
// The Review step reads the submit button's rect to decide whether it sits
// below the fold, so tests stub the rect per the repo's established size-stub
// pattern (see receipt-preview.test.tsx).
function stubButtonRect(top: number) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: top,
    width: 0,
    height: 0,
    top,
    right: 0,
    bottom: top,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function draftInitial(overrides: Partial<ExpenseDraftInitial> = {}): ExpenseDraftInitial {
  return {
    claimId: "exp-1",
    title: "Flight ticket",
    category: "Travel",
    subCategory: "Airfare",
    remark: "Client visit",
    amount: "4500",
    expenseDate: "2026-08-05",
    ...overrides,
  };
}

function pickReceipt(name = "receipt.pdf") {
  const file = new File([new Uint8Array([1, 2, 3, 4])], name, { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Add receipt"), { target: { files: [file] } });
  return file;
}

function fillDetails() {
  fireEvent.change(screen.getByLabelText("What was this expense for?"), {
    target: { value: "Client dinner with Acme Corp" },
  });
  fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "1200" } });
  fireEvent.change(screen.getByLabelText("Expense date"), { target: { value: "2026-08-01" } });
  fireEvent.change(screen.getByLabelText(/remark/i), { target: { value: "Team dinner" } });
}

function lastPreviewProps() {
  return receiptPreviewCalls.props.at(-1);
}

beforeEach(() => {
  scrollIntoViewMock.mockReset();
  receiptPreviewCalls.props = [];
  receiptPreviewCalls.mounts = 0;
  receiptPreviewCalls.unmounts = 0;
  receiptPreviewCalls.sourceLoads = 0;
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: scrollIntoViewMock,
  });
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete Element.prototype.scrollIntoView;
});

async function advanceToReviewStep() {
  render(<ExpenseCreateForm />);
  pickReceipt();
  fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
  fillDetails();
  fireEvent.click(screen.getByRole("button", { name: /review claim/i }));
  await screen.findByRole("button", { name: /submit for approval/i });
  // Flush the Review step's mount effect so the scroll decision has always
  // run before any assertion.
  await act(async () => {});
}

describe("ExpenseCreateForm Review step auto-scroll", () => {
  it("scrolls the submit button into view when it sits below the fold on entry", async () => {
    stubButtonRect(1200);
    await advanceToReviewStep();

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
  });

  it("does not scroll when the submit button is already fully visible", async () => {
    stubButtonRect(300);
    await advanceToReviewStep();

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("scrolls instantly when the user prefers reduced motion", async () => {
    stubButtonRect(1200);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    await advanceToReviewStep();

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "auto", block: "nearest" });
  });

  it("scrolls again on every re-entry into the Review step", async () => {
    stubButtonRect(1200);
    await advanceToReviewStep();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.click(screen.getByRole("button", { name: /review claim/i }));

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("ExpenseCreateForm persistent receipt preview", () => {
  it("embeds the preview in the capture rail with the local file after picking a receipt", () => {
    render(<ExpenseCreateForm />);
    const file = pickReceipt();

    const preview = screen.getByTestId("receipt-preview");
    expect(preview.closest("aside")).not.toBeNull();
    expect(lastPreviewProps()?.file).toBe(file);
    expect(lastPreviewProps()?.fileName).toBe("receipt.pdf");
    expect(lastPreviewProps()?.claimId).toBeUndefined();
    expect(lastPreviewProps()?.onClose).toBeUndefined();
  });

  it("renders nothing in the rail when no receipt exists", () => {
    render(<ExpenseCreateForm />);

    expect(screen.queryByTestId("receipt-preview")).toBeNull();
    expect(screen.getByText("FAST CAPTURE")).toBeInTheDocument();
  });

  it("removing the picked file collapses the preview surface and repicking restores it", async () => {
    render(<ExpenseCreateForm />);
    pickReceipt();
    expect(screen.getByTestId("receipt-preview")).toBeInTheDocument();
    expect(receiptPreviewCalls.mounts).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByTestId("receipt-preview")).toBeNull();
    expect(screen.getByText("FAST CAPTURE")).toBeInTheDocument();
    expect(receiptPreviewCalls.unmounts).toBe(1);

    const replacement = pickReceipt("replacement.pdf");
    await act(async () => {});
    expect(screen.getByTestId("receipt-preview")).toBeInTheDocument();
    expect(receiptPreviewCalls.mounts).toBe(2);
    expect(lastPreviewProps()?.file).toBe(replacement);
  });

  it("renders the preview from the stored receipt path on a resumed draft", () => {
    render(<ExpenseCreateForm initial={draftInitial({ receiptFileName: "stored.pdf" })} />);

    const preview = screen.getByTestId("receipt-preview");
    expect(preview.closest("aside")).not.toBeNull();
    expect(lastPreviewProps()?.claimId).toBe("exp-1");
    expect(lastPreviewProps()?.fileName).toBe("stored.pdf");
    expect(lastPreviewProps()?.file).toBeUndefined();
    expect(screen.getByText("Receipt already attached: stored.pdf")).toBeInTheDocument();
  });

  it("keeps the preview mounted across all three steps", async () => {
    render(<ExpenseCreateForm />);
    const file = pickReceipt();
    expect(lastPreviewProps()?.file).toBe(file);
    expect(receiptPreviewCalls.mounts).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    expect(screen.getByTestId("receipt-preview")).toBeInTheDocument();
    expect(lastPreviewProps()?.file).toBe(file);
    expect(receiptPreviewCalls.mounts).toBe(1);

    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /review claim/i }));
    await screen.findByRole("button", { name: /submit for approval/i });

    expect(screen.getByTestId("receipt-preview")).toBeInTheDocument();
    expect(lastPreviewProps()?.claimId).toBe("exp-1");
    expect(lastPreviewProps()?.fileName).toBe("receipt.pdf");
    expect(receiptPreviewCalls.mounts).toBe(2);
    expect(receiptPreviewCalls.sourceLoads).toBe(2);
  });

  it("keeps one stored preview mounted through all steps and Back/re-entry", async () => {
    render(<ExpenseCreateForm initial={draftInitial({ receiptFileName: "stored.pdf" })} />);
    await act(async () => {});

    const preview = screen.getByTestId("receipt-preview");
    expect(receiptPreviewCalls.mounts).toBe(1);
    expect(receiptPreviewCalls.sourceLoads).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    expect(screen.getByTestId("receipt-preview")).toBe(preview);
    expect(receiptPreviewCalls.mounts).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /review claim/i }));
    await screen.findByRole("button", { name: /submit for approval/i });
    expect(screen.getByTestId("receipt-preview")).toBe(preview);
    expect(receiptPreviewCalls.mounts).toBe(1);
    expect(receiptPreviewCalls.sourceLoads).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /continue with receipt/i })).toBeInTheDocument();
    expect(screen.getByTestId("receipt-preview")).toBe(preview);

    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    expect(screen.getByTestId("receipt-preview")).toBe(preview);
    expect(receiptPreviewCalls.mounts).toBe(1);
    expect(receiptPreviewCalls.sourceLoads).toBe(1);
  });

  it("reloads the preview source when a different file is picked", async () => {
    render(<ExpenseCreateForm />);
    pickReceipt();
    const replacement = pickReceipt("replacement.pdf");
    await act(async () => {});

    expect(receiptPreviewCalls.mounts).toBe(2);
    expect(receiptPreviewCalls.sourceLoads).toBe(2);
    expect(lastPreviewProps()?.file).toBe(replacement);
    expect(lastPreviewProps()?.fileName).toBe("replacement.pdf");
  });

  it("removes the Step-1 preview toggle and keeps the file-name pill", () => {
    render(<ExpenseCreateForm initial={draftInitial({ receiptFileName: "stored.pdf" })} />);

    expect(screen.getByText("Receipt already attached: stored.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide preview" })).toBeNull();
  });
});

describe("ExpenseCreateForm mobile receipt sheet", () => {
  function stubMobileViewport() {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  }

  it("does not mount the embedded preview on the first mobile render", () => {
    stubMobileViewport();
    render(<ExpenseCreateForm initial={draftInitial({ receiptFileName: "stored.pdf" })} />);

    expect(receiptPreviewCalls.mounts).toBe(0);
    expect(screen.queryByTestId("receipt-preview")).toBeNull();
    expect(screen.getByRole("button", { name: "View receipt" })).toBeInTheDocument();
  });

  it("shows a View receipt button instead of the embedded preview and opens the sheet", async () => {
    stubMobileViewport();
    render(<ExpenseCreateForm />);
    pickReceipt();

    expect(screen.queryByTestId("receipt-preview")).toBeNull();
    const viewButton = screen.getByRole("button", { name: "View receipt" });

    fireEvent.click(viewButton);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Receipt preview");
    expect(screen.getByTestId("receipt-preview")).toBeInTheDocument();
    expect(lastPreviewProps()?.fileName).toBe("receipt.pdf");
    expect(typeof lastPreviewProps()?.onClose).toBe("function");
    expect(document.body.style.overflow).toBe("hidden");

    const closeButton = screen.getByTestId("receipt-preview-close");
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });
  });

  it("closes the sheet via the close button and returns focus to the trigger", async () => {
    stubMobileViewport();
    render(<ExpenseCreateForm />);
    pickReceipt();
    const viewButton = screen.getByRole("button", { name: "View receipt" });
    fireEvent.click(viewButton);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByTestId("receipt-preview-close"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.queryByTestId("receipt-preview")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    await waitFor(() => {
      expect(viewButton).toHaveFocus();
    });
  });

  it("closes the sheet via Escape", async () => {
    stubMobileViewport();
    render(<ExpenseCreateForm />);
    pickReceipt();
    fireEvent.click(screen.getByRole("button", { name: "View receipt" }));
    await screen.findByRole("dialog");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("closes the sheet via the backdrop", async () => {
    stubMobileViewport();
    render(<ExpenseCreateForm />);
    pickReceipt();
    fireEvent.click(screen.getByRole("button", { name: "View receipt" }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("keeps the trigger and open sheet available through Steps 1, 2, and 3", async () => {
    stubMobileViewport();
    render(<ExpenseCreateForm />);
    pickReceipt();

    const stepOneTrigger = screen.getByRole("button", { name: "View receipt" });
    fireEvent.click(stepOneTrigger);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByTestId("receipt-preview-close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stepOneTrigger).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    const stepTwoTrigger = screen.getByRole("button", { name: "View receipt" });
    expect(stepTwoTrigger).toBe(stepOneTrigger);
    fireEvent.click(stepTwoTrigger);
    await screen.findByRole("dialog");

    fillDetails();
    fireEvent.click(screen.getByRole("button", { name: /review claim/i }));
    await screen.findByRole("button", { name: /submit for approval/i });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const stepThreeTrigger = screen.getByRole("button", { name: "View receipt" });
    expect(stepThreeTrigger).toBe(stepOneTrigger);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stepThreeTrigger).toHaveFocus();

    fireEvent.click(stepThreeTrigger);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stepThreeTrigger).toHaveFocus();
  });

  it("opens the sheet for a stored receipt on a resumed draft", async () => {
    stubMobileViewport();
    render(<ExpenseCreateForm initial={draftInitial({ receiptFileName: "stored.pdf" })} />);

    const viewButton = screen.getByRole("button", { name: "View receipt" });
    expect(screen.queryByTestId("receipt-preview")).toBeNull();

    fireEvent.click(viewButton);
    await screen.findByRole("dialog");

    expect(lastPreviewProps()?.claimId).toBe("exp-1");
    expect(lastPreviewProps()?.fileName).toBe("stored.pdf");
  });
});

describe("ExpenseCreateForm autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function advanceAutosaveDebounce() {
    return act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
  }

  it("persists a new draft via POST after the debounce once details are complete", async () => {
    const fetchMock = stubFetch();
    render(<ExpenseCreateForm />);
    pickReceipt();
    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    fillDetails();
    await advanceAutosaveDebounce();

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/expenses");
    expect(init.method).toBe("POST");
  });

  it("does not autosave while the draft is incomplete", async () => {
    const fetchMock = stubFetch();
    render(<ExpenseCreateForm />);
    pickReceipt();
    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    // Only the title, no amount yet: still not persistable.
    fireEvent.change(screen.getByLabelText("What was this expense for?"), {
      target: { value: "Client dinner" },
    });
    await advanceAutosaveDebounce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not autosave on mount with an untouched resumed draft", async () => {
    const fetchMock = stubFetch();
    render(<ExpenseCreateForm initial={draftInitial({ receiptFileName: "stored.pdf" })} />);
    await advanceAutosaveDebounce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("patches the existing draft via PATCH once a claim id exists", async () => {
    const fetchMock = stubFetch();
    render(<ExpenseCreateForm initial={draftInitial({ receiptFileName: "stored.pdf" })} />);
    // A resumed draft starts at the receipt step with its stored receipt, so
    // move to the details step first, then touch a field to mark it dirty.
    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    fireEvent.change(screen.getByLabelText("What was this expense for?"), {
      target: { value: "Updated flight" },
    });
    await advanceAutosaveDebounce();

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/expenses/exp-1");
    expect(init.method).toBe("PATCH");
  });

  it("clears the dirty flag after a successful autosave so it does not fire again", async () => {
    const fetchMock = stubFetch();
    render(<ExpenseCreateForm />);
    pickReceipt();
    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    fillDetails();
    await advanceAutosaveDebounce();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Nothing changed since the save, so no second autosave.
    await advanceAutosaveDebounce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets the explicit review save win while an autosave is in flight", async () => {
    const fetchMock = stubFetch();
    render(<ExpenseCreateForm />);
    pickReceipt();
    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    fillDetails();
    await advanceAutosaveDebounce();

    // The autosave is still in flight; clicking Review must wait for it and
    // still persist + advance to the review step.
    fireEvent.click(screen.getByRole("button", { name: /review claim/i }));
    await advanceAutosaveDebounce();

    expect(screen.getByRole("button", { name: /submit for approval/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    // The autosave POSTed the new draft; the review save then PATCHes the
    // known claim and still advances to the review step.
    expect(fetchMock.mock.calls.at(-1)![1].method).toBe("PATCH");
  });

  it("does not drop the newest edits when an autosave fires during another save", async () => {
    // The first request stays unresolved (simulating a slow save) while a
    // second debounce fires; the second save must wait for the first and
    // then persist the newest state instead of being skipped.
    let resolveFirst: (value: unknown) => void = () => {};
    const fetchMock = vi.fn();
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ claim: { id: "exp-1" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ExpenseCreateForm />);
    pickReceipt();
    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    fillDetails();
    await advanceAutosaveDebounce();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The first save is still in flight; type more and let the debounce fire
    // again. The second save must queue behind the first, not vanish.
    fireEvent.change(screen.getByLabelText("What was this expense for?"), {
      target: { value: "Updated after first save" },
    });
    await advanceAutosaveDebounce();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ ok: true, json: async () => ({ claim: { id: "exp-1" } }) });
    });
    await advanceAutosaveDebounce();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondInit] = fetchMock.mock.calls[1];
    expect(secondInit.method).toBe("PATCH");
  });
});
