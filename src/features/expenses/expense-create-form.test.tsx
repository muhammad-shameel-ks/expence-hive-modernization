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
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ claim: { id: "exp-1" } }),
    })),
  );
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
  delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView;
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
    expect(screen.getByText("Start with the proof.")).toBeInTheDocument();
  });

  it("removing the picked file collapses the preview surface and repicking restores it", async () => {
    render(<ExpenseCreateForm />);
    pickReceipt();
    expect(screen.getByTestId("receipt-preview")).toBeInTheDocument();
    expect(receiptPreviewCalls.mounts).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.queryByTestId("receipt-preview")).toBeNull();
    expect(screen.getByText("Start with the proof.")).toBeInTheDocument();
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
    // The remount to the "stored" receipt source is driven by the draft-save
    // fetch's response setting claimId, a state update that lands in a
    // render pass after the review step's button first appears - so this
    // waits for it instead of asserting immediately.
    await waitFor(() => {
      expect(lastPreviewProps()?.claimId).toBe("exp-1");
      expect(lastPreviewProps()?.fileName).toBe("receipt.pdf");
      expect(receiptPreviewCalls.mounts).toBe(2);
      expect(receiptPreviewCalls.sourceLoads).toBe(2);
    });
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

describe("ExpenseCreateForm receipt suggestions (OCR)", () => {
  // The extraction route and the draft routes are stubbed separately so the
  // suggestion flow can be asserted without a real server.
  function stubSuggestionFetch(suggestions: unknown, options: { fail?: boolean } = {}) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/receipts/extract")) {
        if (options.fail) {
          throw new Error("network down");
        }
        return {
          ok: true,
          json: async () => ({ suggestions }),
        };
      }
      return {
        ok: true,
        json: async () => ({ claim: { id: "exp-1" } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function pickReceiptPdf() {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "receipt.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Add receipt"), { target: { files: [file] } });
  }

  const SUGGESTIONS = {
    amountMinor: 37000,
    date: "2026-08-10",
    vendor: "Green Leaf Cafe",
    categoryGuess: "Meals",
  };

  it("shows the extracted suggestions as editable fields after picking a receipt", async () => {
    stubSuggestionFetch(SUGGESTIONS);
    render(<ExpenseCreateForm />);
    pickReceiptPdf();

    const amountInput = await screen.findByLabelText("Amount", { exact: false });
    expect(amountInput).toHaveValue("370.00");
    expect(screen.getByLabelText("Expense date")).toHaveValue("2026-08-10");
    expect(screen.getByLabelText("Vendor", { exact: false })).toHaveValue("Green Leaf Cafe");
    const category = screen.getByLabelText("Suggested category - please confirm", { exact: false });
    expect(category).toHaveValue("Meals");
    expect(screen.getByRole("button", { name: "Apply suggestions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip suggestions" })).toBeInTheDocument();
  });

  it("applies accepted suggestions into the draft fields after confirmation", async () => {
    stubSuggestionFetch(SUGGESTIONS);
    render(<ExpenseCreateForm />);
    pickReceiptPdf();
    await screen.findByLabelText("Amount", { exact: false });

    fireEvent.click(screen.getByRole("button", { name: "Apply suggestions" }));
    expect(screen.getByText(/applied to your draft/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));

    expect(screen.getByLabelText("What was this expense for?")).toHaveValue("Green Leaf Cafe");
    expect(screen.getByLabelText(/amount/i)).toHaveValue("370.00");
    expect(screen.getByLabelText("Expense date")).toHaveValue("2026-08-10");
    expect(screen.getByLabelText("Category")).toHaveValue("Meals");
  });

  it("lets the employee edit a suggestion before applying", async () => {
    stubSuggestionFetch(SUGGESTIONS);
    render(<ExpenseCreateForm />);
    pickReceiptPdf();
    const amountInput = await screen.findByLabelText("Amount", { exact: false });

    fireEvent.change(amountInput, { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply suggestions" }));
    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));

    expect(screen.getByLabelText(/amount/i)).toHaveValue("400");
  });

  it("writes nothing to the draft before the employee applies", async () => {
    const fetchMock = stubSuggestionFetch(SUGGESTIONS);
    render(<ExpenseCreateForm />);
    pickReceiptPdf();
    await screen.findByLabelText("Amount", { exact: false });

    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));

    // No draft save (POST /api/expenses) and no extraction re-run happened
    // on continue; the fields arrive empty.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("What was this expense for?")).toHaveValue("");
    expect(screen.getByLabelText(/amount/i)).toHaveValue("");
  });

  it("dismisses the suggestions and keeps the flow usable", async () => {
    stubSuggestionFetch(SUGGESTIONS);
    render(<ExpenseCreateForm />);
    pickReceiptPdf();
    await screen.findByLabelText("Amount", { exact: false });

    fireEvent.click(screen.getByRole("button", { name: "Skip suggestions" }));

    expect(screen.queryByLabelText("Suggested category - please confirm", { exact: false })).toBeNull();
    expect(screen.getByRole("button", { name: /continue with receipt/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue with receipt/i }));
    expect(screen.getByLabelText(/amount/i)).toHaveValue("");
  });

  it("shows a clear message when the receipt yields no suggestions and keeps the flow usable", async () => {
    stubSuggestionFetch({});
    render(<ExpenseCreateForm />);
    pickReceiptPdf();

    expect(await screen.findByText(/could not read any details from this receipt/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No suggestions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with receipt/i })).toBeInTheDocument();
  });

  it("shows a clear message when extraction fails and keeps the flow usable", async () => {
    stubSuggestionFetch(SUGGESTIONS, { fail: true });
    render(<ExpenseCreateForm />);
    pickReceiptPdf();

    expect(await screen.findByText(/could not read this receipt right now/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with receipt/i })).toBeInTheDocument();
  });

  it("announces the reading state while extraction runs", async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/receipts/extract")) {
          await new Promise((resolve) => {
            resolveFetch = resolve;
          });
          return { ok: true, json: async () => ({ suggestions: SUGGESTIONS }) };
        }
        return { ok: true, json: async () => ({ claim: { id: "exp-1" } }) };
      }),
    );
    render(<ExpenseCreateForm />);
    pickReceiptPdf();

    // jsdom does not expose the explicit "status" role in its accessibility
    // tree, so the live-region message is asserted by its text.
    const reading = await screen.findByText(/reading your receipt/i);
    expect(reading).toBeInTheDocument();

    await act(async () => {
      resolveFetch?.(null);
    });
    await screen.findByLabelText("Amount", { exact: false });
    expect(screen.getByLabelText("Amount", { exact: false })).toHaveValue("370.00");
  });

  it("never extracts for a stored receipt on a resumed draft", async () => {
    const fetchMock = stubSuggestionFetch(SUGGESTIONS);
    render(<ExpenseCreateForm initial={draftInitial({ receiptFileName: "stored.pdf" })} />);

    expect(screen.queryByLabelText("Suggested category - please confirm", { exact: false })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
