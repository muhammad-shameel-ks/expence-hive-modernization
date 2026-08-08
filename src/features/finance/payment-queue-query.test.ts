import { describe, expect, it } from "vitest";
import type { ExpenseClaim } from "@/server/expenses/ports";
import { approvedOnFor, filterAndSortPaymentQueue, paymentStatusFor, rejectionFor } from "./payment-queue-query";

function claim(overrides: Partial<ExpenseClaim>): ExpenseClaim {
  return {
    id: "claim-test",
    ref: "EXP-TEST",
    organizationId: "org-1",
    requesterId: "emp-shameel",
    title: "Test claim",
    category: "Other",
    subCategory: "Other",
    remark: "Test remark",
    amountMinor: 10000,
    currency: "INR",
    expenseDate: "2026-08-04",
    status: "in-finance",
    currentStage: "finance",
    steps: [],
    history: [],
    version: 1,
    createdAt: "2026-08-04T09:00:00Z",
    submittedAt: "2026-08-04T09:00:00Z",
    ...overrides,
  };
}

describe("filterAndSortPaymentQueue", () => {
  it("matches search against title, ref, and category, case-insensitively", () => {
    const list = [
      claim({ id: "by-title", title: "Hotel Karachi" }),
      claim({ id: "by-ref", ref: "EXP-2026-0132" }),
      claim({ id: "by-category", category: "Lodging" }),
      claim({ id: "no-match", title: "Office snacks" }),
    ];
    expect(filterAndSortPaymentQueue(list, { query: "karachi" }).map((c) => c.id)).toEqual(["by-title"]);
    expect(filterAndSortPaymentQueue(list, { query: "exp-2026-0132" }).map((c) => c.id)).toEqual(["by-ref"]);
    expect(filterAndSortPaymentQueue(list, { query: "lodging" }).map((c) => c.id)).toEqual(["by-category"]);
  });

  it("trims the search query and ignores empty queries", () => {
    const list = [claim({ id: "a" }), claim({ id: "b" })];
    expect(filterAndSortPaymentQueue(list, { query: "   " })).toHaveLength(2);
  });

  it("groups claims into Awaiting payment, Paid, and Rejected filters", () => {
    const list = [
      claim({ id: "a", status: "in-finance" }),
      claim({ id: "b", status: "paid" }),
      claim({ id: "c", status: "in-finance" }),
      claim({ id: "d", status: "rejected" }),
    ];
    expect(filterAndSortPaymentQueue(list, { filter: "Awaiting payment" }).map((c) => c.id)).toEqual(["a", "c"]);
    expect(filterAndSortPaymentQueue(list, { filter: "Paid" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterAndSortPaymentQueue(list, { filter: "Rejected" }).map((c) => c.id)).toEqual(["d"]);
    expect(filterAndSortPaymentQueue(list, { filter: "All" })).toHaveLength(4);
  });

  it("filters by category list", () => {
    const list = [
      claim({ id: "a", category: "Travel" }),
      claim({ id: "b", category: "Lodging" }),
      claim({ id: "c", category: "Software" }),
    ];
    expect(filterAndSortPaymentQueue(list, { categories: ["Travel", "Software"] }).map((c) => c.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("filters by amount range in rupees", () => {
    const list = [
      claim({ id: "small", amountMinor: 5000 }),
      claim({ id: "medium", amountMinor: 50000 }),
      claim({ id: "large", amountMinor: 500000 }),
    ];
    expect(filterAndSortPaymentQueue(list, { amountMin: 100, amountMax: 1000 }).map((c) => c.id)).toEqual([
      "medium",
    ]);
  });

  it("filters by submitted date range", () => {
    const list = [
      claim({ id: "early", submittedAt: "2026-07-20T10:00:00Z" }),
      claim({ id: "middle", submittedAt: "2026-07-26T10:00:00Z" }),
      claim({ id: "late", submittedAt: "2026-08-04T10:00:00Z" }),
    ];
    expect(
      filterAndSortPaymentQueue(list, { dateFrom: "2026-07-25", dateTo: "2026-07-30" }).map((c) => c.id),
    ).toEqual(["middle"]);
  });

  it("sorts by amount in either direction", () => {
    const list = [claim({ id: "a", amountMinor: 3000 }), claim({ id: "b", amountMinor: 1000 }), claim({ id: "c", amountMinor: 2000 })];
    expect(filterAndSortPaymentQueue(list, { sortKey: "amount", sortDir: 1 }).map((c) => c.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(filterAndSortPaymentQueue(list, { sortKey: "amount", sortDir: -1 }).map((c) => c.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("sorts by submission date, newest first by default", () => {
    const list = [
      claim({ id: "newest", submittedAt: "2026-08-03T09:00:00Z" }),
      claim({ id: "older", submittedAt: "2026-07-29T13:20:00Z" }),
      claim({ id: "newer-still", submittedAt: "2026-08-03T10:00:00Z" }),
    ];
    expect(filterAndSortPaymentQueue(list, { sortKey: "submitted" }).map((c) => c.id)).toEqual([
      "newer-still",
      "newest",
      "older",
    ]);
  });

  it("combines search and filter", () => {
    const list = [
      claim({ id: "match", title: "Hotel Karachi", status: "in-finance" }),
      claim({ id: "wrong-status", title: "Hotel Karachi", status: "paid" }),
      claim({ id: "wrong-title", title: "Office snacks", status: "in-finance" }),
    ];
    expect(filterAndSortPaymentQueue(list, { query: "karachi", filter: "Awaiting payment" }).map((c) => c.id)).toEqual([
      "match",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    const list = [claim({ id: "a" })];
    expect(filterAndSortPaymentQueue(list, { query: "zzz-no-such-claim" })).toEqual([]);
  });

  it("matches search against sub category and remark", () => {
    const list = [
      claim({ id: "by-sub-category", subCategory: "Airfare" }),
      claim({ id: "by-remark", remark: "Client kickoff travel" }),
      claim({ id: "no-match", subCategory: "Other", remark: "Nothing relevant" }),
    ];
    expect(filterAndSortPaymentQueue(list, { query: "airfare" }).map((c) => c.id)).toEqual(["by-sub-category"]);
    expect(filterAndSortPaymentQueue(list, { query: "kickoff" }).map((c) => c.id)).toEqual(["by-remark"]);
  });
});

describe("paymentStatusFor", () => {
  it("reports Paid, Not Paid, and Rejected payment statuses", () => {
    expect(paymentStatusFor(claim({ status: "paid" }))).toBe("Paid");
    expect(paymentStatusFor(claim({ status: "in-finance" }))).toBe("Not Paid");
    expect(paymentStatusFor(claim({ status: "rejected" }))).toBe("Rejected");
  });
});

describe("rejectionFor", () => {
  it("returns the latest rejected history event", () => {
    const withRejections = claim({
      history: [
        { id: "h1", kind: "rejected", actorId: "emp-ada", detail: "First rejection", createdAt: "2026-07-27T10:00:00Z" },
        { id: "h2", kind: "rejected", actorId: "emp-finance", detail: "Final rejection", createdAt: "2026-07-29T09:05:00Z" },
      ],
    });
    expect(rejectionFor(withRejections)).toMatchObject({
      kind: "rejected",
      actorId: "emp-finance",
      detail: "Final rejection",
    });
  });

  it("ignores non-rejection events when picking the latest rejection", () => {
    const withLaterApproval = claim({
      history: [
        { id: "h1", kind: "rejected", actorId: "emp-ada", detail: "Missing receipt", createdAt: "2026-07-27T10:00:00Z" },
        { id: "h2", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-07-28T10:00:00Z" },
      ],
    });
    expect(rejectionFor(withLaterApproval)).toMatchObject({ detail: "Missing receipt" });
  });

  it("returns undefined when no rejection has happened", () => {
    expect(rejectionFor(claim())).toBeUndefined();
  });
});

describe("approvedOnFor", () => {
  it("returns the timestamp of the last approval event", () => {
    const withApprovals = claim({
      history: [
        { id: "h1", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-07-26T08:55:00Z" },
        { id: "h2", kind: "approved", actorId: "emp-ada", createdAt: "2026-07-27T10:00:00Z" },
        { id: "h3", kind: "approved", actorId: "emp-pramod", createdAt: "2026-07-29T09:05:00Z" },
      ],
    });
    expect(approvedOnFor(withApprovals)).toBe("2026-07-29T09:05:00Z");
  });

  it("returns undefined when no approval has happened yet", () => {
    const withoutApprovals = claim({ history: [{ id: "h1", kind: "draft", actorId: "emp-shameel", createdAt: "2026-08-04T09:00:00Z" }] });
    expect(approvedOnFor(withoutApprovals)).toBeUndefined();
  });
});
