import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExpenseClaim } from "@/server/expenses/ports";
import {
  PAYMENT_QUEUE_COLUMNS,
  type PaymentQueueColumnHelpers,
  type PaymentQueueColumnTextHelpers,
} from "./payment-queue-columns";

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

function buildHelpers(overrides: Partial<PaymentQueueColumnHelpers> = {}): PaymentQueueColumnHelpers {
  return {
    employeeNameById: new Map([["employee-1", "Ada Lovelace"]]),
    paymentStatusFor: (claim) => (claim.status === "paid" ? "Paid" : "Not Paid"),
    approvedOnFor: () => undefined,
    hasReceiptAttachment: () => false,
    rowSelectedFor: () => false,
    previewButtonRefFor: () => () => {},
    onToggleReceiptPreview: () => {},
    actingClaimId: null,
    terminalActionFor: () => null,
    onTerminalAction: () => {},
    commentValueFor: (claim) => claim.comments ?? "",
    savingCommentFor: null,
    onSaveComment: () => {},
    ...overrides,
  };
}

describe("PAYMENT_QUEUE_COLUMNS", () => {
  it("gives every column a unique id", () => {
    const ids = PAYMENT_QUEUE_COLUMNS.map((column) => column.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every column a non-empty label", () => {
    for (const column of PAYMENT_QUEUE_COLUMNS) {
      expect(column.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every column a renderer", () => {
    for (const column of PAYMENT_QUEUE_COLUMNS) {
      expect(typeof column.render).toBe("function");
    }
  });

  it("uses distinct supported sort keys on sortable columns only", () => {
    const sortKeys = PAYMENT_QUEUE_COLUMNS.map((column) => column.sortKey).filter(
      (key): key is NonNullable<typeof key> => key !== undefined,
    );
    expect(sortKeys).toEqual(["ref", "category", "submitted", "amount", "status"]);
    expect(new Set(sortKeys).size).toBe(sortKeys.length);
  });

  it("keeps the sortable labels in the same order the table sorts by", () => {
    const sortableLabels = PAYMENT_QUEUE_COLUMNS.filter((column) => column.sortKey).map(
      (column) => column.label,
    );
    expect(sortableLabels).toEqual(["Reference", "Category", "Bill submission", "Amount", "Status"]);
  });
});

describe("PAYMENT_QUEUE_COLUMNS renderers", () => {
  const claim = buildClaim({
    subCategory: "Team dinner",
    remark: "Approved by manager",
  });
  const helpers = buildHelpers();

  it("renders the reference cell with title and ref", () => {
    const column = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "reference")!;
    const html = renderToStaticMarkup(column.render(claim, helpers));
    expect(html).toContain("Client dinner");
    expect(html).toContain("EXP-0001");
  });

  it("renders the name cell with the employee name from the helpers", () => {
    const column = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "name")!;
    const html = renderToStaticMarkup(column.render(claim, helpers));
    expect(html).toContain("Ada Lovelace");
  });

  it("renders plain data cells from the claim", () => {
    const expectations: Array<[string, string]> = [
      ["category", "Meals"],
      ["subCategory", "Team dinner"],
      ["billSubmission", "2026-08-01"],
      ["billInvoiceDate", "2026-08-01"],
      ["amount", "₹1250.00"],
      ["status", "in-finance"],
      ["remark", "Approved by manager"],
    ];
    for (const [id, expected] of expectations) {
      const column = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === id)!;
      expect(renderToStaticMarkup(column.render(claim, helpers))).toBe(expected);
    }
  });

  it("renders fallback dashes for empty sub category and remark", () => {
    const empty = buildClaim();
    const subCategory = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "subCategory")!;
    const remark = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "remark")!;
    expect(renderToStaticMarkup(subCategory.render(empty, helpers))).toBe("-");
    expect(renderToStaticMarkup(remark.render(empty, helpers))).toBe("-");
  });

  it("renders the approved-on date from the helpers' approval lookup", () => {
    const column = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "approvedOn")!;
    const helpersWithApproval = buildHelpers({
      approvedOnFor: () => "2026-08-02T10:00:00.000Z",
    });
    expect(renderToStaticMarkup(column.render(claim, helpersWithApproval))).toBe("2026-08-02");
    expect(renderToStaticMarkup(column.render(claim, helpers))).toBe("-");
  });

  it("renders the payment status from the helpers' payment status lookup", () => {
    const column = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "paymentStatus")!;
    const paid = buildClaim({ status: "paid" });
    expect(renderToStaticMarkup(column.render(claim, helpers))).toContain("Not Paid");
    expect(renderToStaticMarkup(column.render(paid, helpers))).toContain("Paid");
  });

  it("renders the terminal action button from the helpers' action lookup", () => {
    const column = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "paymentStatus")!;
    const actionable = buildHelpers({ terminalActionFor: () => "pay" });
    const html = renderToStaticMarkup(column.render(claim, actionable));
    expect(html).toContain("Mark paid");
    expect(html).not.toContain("Verify for payment");
    const verify = buildHelpers({ terminalActionFor: () => "verify" });
    expect(renderToStaticMarkup(column.render(claim, verify))).toContain("Verify for payment");
  });

  it("renders the comment input with the helpers' saved value", () => {
    const column = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "comments")!;
    const withComment = buildHelpers({ commentValueFor: () => "Waiting on receipt" });
    const html = renderToStaticMarkup(column.render(claim, withComment));
    expect(html).toContain('value="Waiting on receipt"');
    expect(html).toContain('aria-label="Comment for EXP-0001"');
  });
});

describe("PAYMENT_QUEUE_COLUMNS text values", () => {
  const claim = buildClaim({
    subCategory: "Team dinner",
    remark: "Approved by manager",
    comments: "Finance note",
  });

  function buildTextHelpers(
    overrides: Partial<PaymentQueueColumnTextHelpers> = {},
  ): PaymentQueueColumnTextHelpers {
    return {
      employeeNameById: new Map([
        ["employee-1", "Ada Lovelace"],
        ["employee-2", "Grace Hopper"],
      ]),
      paymentStatusFor: (c) => (c.status === "paid" ? "Paid" : c.status === "rejected" ? "Rejected" : "Not Paid"),
      approvedOnFor: () => undefined,
      commentValueFor: (c) => c.comments ?? "",
      ...overrides,
    };
  }

  const helpers = buildTextHelpers();

  it("gives every column a plain-text accessor", () => {
    for (const column of PAYMENT_QUEUE_COLUMNS) {
      expect(typeof column.textValue).toBe("function");
    }
  });

  it("exports plain strings, never JSX", () => {
    for (const column of PAYMENT_QUEUE_COLUMNS) {
      const value = column.textValue(claim, helpers);
      expect(typeof value === "string" || typeof value === "number").toBe(true);
    }
  });

  it("exports the amount as a number and every other column as a string", () => {
    const amount = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "amount")!;
    expect(amount.textValue(claim, helpers)).toBe(1250);
    for (const column of PAYMENT_QUEUE_COLUMNS) {
      if (column.id === "amount") continue;
      expect(typeof column.textValue(claim, helpers)).toBe("string");
    }
  });

  it("exports the same content the renderer shows for plain cells", () => {
    const expectations: Array<[string, string | number]> = [
      ["name", "Ada Lovelace"],
      ["reference", "Client dinner (EXP-0001)"],
      ["category", "Meals"],
      ["subCategory", "Team dinner"],
      ["billSubmission", "2026-08-01"],
      ["billInvoiceDate", "2026-08-01"],
      ["status", "in-finance"],
      ["paymentStatus", "Not Paid"],
      ["approvedOn", "-"],
      ["remark", "Approved by manager"],
      ["comments", "Finance note"],
    ];
    for (const [id, expected] of expectations) {
      const column = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === id)!;
      expect(column.textValue(claim, helpers)).toBe(expected);
    }
  });

  it("maps paid and rejected claims to their payment status strings", () => {
    const paymentStatus = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "paymentStatus")!;
    expect(paymentStatus.textValue(buildClaim({ status: "paid" }), helpers)).toBe("Paid");
    expect(paymentStatus.textValue(buildClaim({ status: "rejected" }), helpers)).toBe("Rejected");
  });

  it("exports the approved-on date from the helpers' approval lookup", () => {
    const approvedOn = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "approvedOn")!;
    const withApproval = buildTextHelpers({ approvedOnFor: () => "2026-08-02T10:00:00.000Z" });
    expect(approvedOn.textValue(claim, withApproval)).toBe("2026-08-02");
    expect(approvedOn.textValue(claim, helpers)).toBe("-");
  });

  it("exports the read-only rejection note for rejected claims, not the comments field", () => {
    const rejected = buildClaim({
      status: "rejected",
      comments: "Would-be comment",
      history: [
        {
          id: "h-1",
          kind: "rejected",
          actorId: "employee-2",
          detail: "Missing itemized receipt",
          createdAt: "2026-08-03T11:00:00.000Z",
        },
      ],
    });
    const comments = PAYMENT_QUEUE_COLUMNS.find((c) => c.id === "comments")!;
    expect(comments.textValue(rejected, helpers)).toBe(
      "Missing itemized receipt - Rejected by Grace Hopper on 2026-08-03",
    );
  });
});
