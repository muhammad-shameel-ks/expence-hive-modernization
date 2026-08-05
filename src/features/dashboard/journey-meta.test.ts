import { describe, expect, it } from "vitest";
import { formatMoney, submittedLabel } from "./journey-meta";
import { getJourneyFlowItems } from "./expense-drawer";

describe("formatMoney", () => {
  it("always shows two decimals for a consistent financial surface", () => {
    expect(formatMoney(594)).toBe("₹594.00");
    expect(formatMoney(594.6)).toBe("₹594.60");
    expect(formatMoney(100.25)).toBe("₹100.25");
  });

  it("respects the currency", () => {
    expect(formatMoney(340, "EUR")).toBe("€340.00");
  });
});

describe("submittedLabel", () => {
  it("renders the submission date from the ISO timestamp", () => {
    expect(submittedLabel("2026-08-03T10:42:00Z")).toBe("Aug 3");
    expect(submittedLabel("2026-07-29T13:20:00Z")).toBe("Jul 29");
  });

  it("falls back to the raw value instead of 'Invalid Date' for malformed input", () => {
    expect(submittedLabel("not-a-date")).toBe("not-a-date");
    expect(submittedLabel("")).toBe("");
  });
});

describe("getJourneyFlowItems", () => {
  it("renders full workflow with pending steps greyed out for in-progress claims", () => {
    const mockExpense = {
      id: "ex-1",
      ref: "EXP-1",
      title: "Test",
      category: "Software",
      amount: 100,
      currency: "INR",
      date: "Aug 4",
      submittedAt: "2026-08-03T10:00:00Z",
      status: "in-finance" as const,
      nextStage: "Finance verification",
      nextActor: "Finance Officer",
      attachments: [],
      history: [
        { id: "h1", date: "Aug 3", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 3", actor: "Manager", kind: "approved" as const },
      ],
    };

    const steps = getJourneyFlowItems(mockExpense);
    expect(steps.length).toBe(4);
    expect(steps[0].pending).toBe(false);
    expect(steps[1].pending).toBe(false);
    expect(steps[2]).toMatchObject({
      id: "pending-verification",
      label: "Finance verification",
      pending: true,
    });
    expect(steps[3]).toMatchObject({
      id: "pending-payment",
      label: "Paid",
      pending: true,
    });
  });

  it("returns only history steps without pending steps for terminal paid expense", () => {
    const paidExpense = {
      id: "ex-paid",
      ref: "EXP-PAID",
      title: "Paid claim",
      category: "Travel",
      amount: 500,
      currency: "INR",
      date: "Aug 1",
      submittedAt: "2026-08-01T10:00:00Z",
      status: "paid" as const,
      attachments: [],
      history: [
        { id: "h1", date: "Aug 1", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 1", actor: "Manager", kind: "approved" as const },
        { id: "h3", date: "Aug 2", actor: "Finance", kind: "verified" as const },
        { id: "h4", date: "Aug 2", actor: "Finance", kind: "paid" as const },
      ],
    };

    const steps = getJourneyFlowItems(paidExpense);
    expect(steps.length).toBe(4);
    expect(steps.every((s) => !s.pending)).toBe(true);
  });
});

