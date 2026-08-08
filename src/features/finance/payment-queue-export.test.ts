import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { ExpenseClaim } from "@/server/expenses/ports";
import {
  PAYMENT_QUEUE_COLUMNS,
  type PaymentQueueColumnTextHelpers,
} from "./payment-queue-columns";
import { approvedOnFor, paymentStatusFor } from "./payment-queue-query";
import {
  buildAndDownloadXlsx,
  exportFileName,
  rowsToWorkbook,
  XLSX_MIME_TYPE,
} from "./payment-queue-export";

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

function buildRejectedClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return buildClaim({
    id: "claim-rejected",
    ref: "EXP-0002",
    title: "Team lunch",
    status: "rejected",
    history: [
      { id: "h-1", kind: "draft", actorId: "employee-1", createdAt: "2026-08-01T09:00:00.000Z" },
      {
        id: "h-2",
        kind: "rejected",
        actorId: "employee-2",
        detail: "Missing itemized receipt",
        createdAt: "2026-08-03T11:00:00.000Z",
      },
    ],
    ...overrides,
  });
}

function buildTextHelpers(
  overrides: Partial<PaymentQueueColumnTextHelpers> = {},
): PaymentQueueColumnTextHelpers {
  return {
    employeeNameById: new Map([
      ["employee-1", "Ada Lovelace"],
      ["employee-2", "Grace Hopper"],
    ]),
    paymentStatusFor,
    approvedOnFor,
    commentValueFor: (claim) => claim.comments ?? "",
    ...overrides,
  };
}

const HELPERS = buildTextHelpers();

function colIndex(id: string): number {
  return PAYMENT_QUEUE_COLUMNS.findIndex((column) => column.id === id);
}

function dataRows(workbook: XLSX.WorkBook): unknown[][] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

describe("rowsToWorkbook", () => {
  it("uses the schema labels as the header row, in schema order", () => {
    const workbook = rowsToWorkbook([buildClaim()], HELPERS);
    const rows = dataRows(workbook);
    expect(rows[0]).toEqual(PAYMENT_QUEUE_COLUMNS.map((column) => column.label));
  });

  it("names the sheet and keeps all schema columns regardless of responsive hiding", () => {
    const workbook = rowsToWorkbook([buildClaim()], HELPERS);
    expect(workbook.SheetNames).toEqual(["Payment queue"]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const width = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1").e.c + 1;
    expect(width).toBe(PAYMENT_QUEUE_COLUMNS.length);
  });

  it("maps claim fields to the expected export cells", () => {
    const claim = buildClaim({
      subCategory: "Team dinner",
      remark: "Approved by manager",
      comments: "Finance note",
    });
    const workbook = rowsToWorkbook([claim], HELPERS);
    const row = dataRows(workbook)[1];

    expect(row[colIndex("name")]).toBe("Ada Lovelace");
    expect(row[colIndex("reference")]).toBe("Client dinner (EXP-0001)");
    expect(row[colIndex("category")]).toBe("Meals");
    expect(row[colIndex("subCategory")]).toBe("Team dinner");
    expect(row[colIndex("billSubmission")]).toBe("2026-08-01");
    expect(row[colIndex("billInvoiceDate")]).toBe("2026-08-01");
    expect(row[colIndex("status")]).toBe("in-finance");
    expect(row[colIndex("paymentStatus")]).toBe("Not Paid");
    expect(row[colIndex("approvedOn")]).toBe("-");
    expect(row[colIndex("remark")]).toBe("Approved by manager");
    expect(row[colIndex("comments")]).toBe("Finance note");
  });

  it("exports the amount as a number, not a formatted string", () => {
    const workbook = rowsToWorkbook([buildClaim()], HELPERS);
    const row = dataRows(workbook)[1];
    expect(row[colIndex("amount")]).toBe(1250);
    expect(typeof row[colIndex("amount")]).toBe("number");
  });

  it("exports the approved-on date from the approval history when present", () => {
    const claim = buildClaim({
      history: [
        { id: "h-1", kind: "approved", actorId: "employee-2", createdAt: "2026-08-02T10:00:00.000Z" },
      ],
    });
    const workbook = rowsToWorkbook([claim], HELPERS);
    expect(dataRows(workbook)[1][colIndex("approvedOn")]).toBe("2026-08-02");
  });

  it("maps the payment status per claim: Not Paid, Paid, Rejected", () => {
    const paid = buildClaim({ id: "claim-paid", status: "paid" });
    const rejected = buildRejectedClaim();
    const workbook = rowsToWorkbook([buildClaim(), paid, rejected], HELPERS);
    const rows = dataRows(workbook).slice(1);
    expect(rows.map((row) => row[colIndex("paymentStatus")])).toEqual([
      "Not Paid",
      "Paid",
      "Rejected",
    ]);
  });

  it("exports the read-only rejection note in the comments cell of rejected claims", () => {
    const workbook = rowsToWorkbook([buildRejectedClaim()], HELPERS);
    const row = dataRows(workbook)[1];
    expect(row[colIndex("comments")]).toBe(
      "Missing itemized receipt - Rejected by Grace Hopper on 2026-08-03",
    );
  });

  it("falls back to the claim's comments for non-rejected claims with a comment", () => {
    const claim = buildClaim({ comments: "Waiting on receipt" });
    const workbook = rowsToWorkbook([claim], HELPERS);
    expect(dataRows(workbook)[1][colIndex("comments")]).toBe("Waiting on receipt");
  });

  it("builds a workbook from rejected, paid, and awaiting claims together", () => {
    const awaiting = buildClaim();
    const paid = buildClaim({ id: "claim-paid", ref: "EXP-0003", status: "paid" });
    const rejected = buildRejectedClaim();
    const workbook = rowsToWorkbook([rejected, paid, awaiting], HELPERS);

    const rows = dataRows(workbook);
    expect(rows).toHaveLength(4); // header + 3 claims
    expect(rows.slice(1).map((row) => row[colIndex("reference")])).toEqual([
      "Team lunch (EXP-0002)",
      "Client dinner (EXP-0003)",
      "Client dinner (EXP-0001)",
    ]);
    expect(rows.slice(1).map((row) => row[colIndex("status")])).toEqual([
      "rejected",
      "paid",
      "in-finance",
    ]);
  });

  it("applies Excel's Indian number format to numeric cells", () => {
    const workbook = rowsToWorkbook([buildClaim({ amountMinor: 12500550 })], HELPERS);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const cell = sheet[XLSX.utils.encode_cell({ r: 1, c: colIndex("amount") })] as XLSX.CellObject;
    expect(cell.v).toBe(125005.5);
    expect(cell.z).toContain("##");
  });

  it("produces a workbook whose serialized bytes are a real xlsx zip", () => {
    const workbook = rowsToWorkbook([buildClaim(), buildRejectedClaim()], HELPERS);
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(new Uint8Array(bytes)[0]).toBe(0x50); // "P" of the PK zip magic
  });
});

describe("exportFileName", () => {
  const date = new Date("2026-08-08T10:30:00.000Z");

  it("dates the full-queue filename", () => {
    expect(exportFileName("full", date)).toBe("payment-queue-2026-08-08.xlsx");
  });

  it("distinguishes the current-view filename", () => {
    expect(exportFileName("current", date)).toBe("payment-queue-current-2026-08-08.xlsx");
  });

  it("derives the date at runtime when none is given", () => {
    expect(exportFileName("full")).toMatch(/^payment-queue-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

describe("buildAndDownloadXlsx", () => {
  it("hands the download seam the xlsx blob and the dated filename", async () => {
    const downloadBlob = vi.fn();
    const date = new Date("2026-08-08T10:30:00.000Z");

    buildAndDownloadXlsx([buildClaim()], HELPERS, "full", { now: date, downloadBlob });

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, fileName] = downloadBlob.mock.calls[0] as [Blob, string];
    expect(fileName).toBe("payment-queue-2026-08-08.xlsx");
    expect(blob.type).toBe(XLSX_MIME_TYPE);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x50);
  });
});
