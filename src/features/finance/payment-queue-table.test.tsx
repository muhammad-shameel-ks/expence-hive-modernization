// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { PaymentQueueTable } from "./payment-queue-table";
import type { ExpenseClaim } from "@/server/expenses/ports";

function buildClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return {
    id: "claim-1",
    ref: "EXP-0001",
    organizationId: "org-1",
    requesterId: "employee-1",
    title: "Client dinner",
    category: "Meals",
    subCategory: "",
    remark: "",
    amountMinor: 125000,
    currency: "INR",
    expenseDate: "2026-08-01",
    status: "in-finance",
    steps: [],
    history: [],
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    submittedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PaymentQueueTable comment save loading state", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})), // never resolves until we control it below
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("marks the comment input busy and shows a spinner while the save is pending", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const claim = buildClaim();
    render(<PaymentQueueTable claims={[claim]} employees={[]} />);

    const input = screen.getByRole("textbox", { name: `Comment for ${claim.ref}` });
    expect(input).not.toHaveAttribute("aria-busy");

    input.focus();
    (input as HTMLInputElement).value = "Approved by finance";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();

    // While the PATCH request is in flight, the input surfaces the pending
    // save via aria-busy/disabled and the inline spinner remains visible.
    await waitFor(() => expect(input).toHaveAttribute("aria-busy", "true"));
    expect(input).toBeDisabled();
    expect(document.querySelector(".animate-spin")).not.toBeNull();

    resolveFetch(new Response(null, { status: 200 }));

    await waitFor(() => expect(input).not.toHaveAttribute("aria-busy"));
    expect(input).not.toBeDisabled();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });
});
