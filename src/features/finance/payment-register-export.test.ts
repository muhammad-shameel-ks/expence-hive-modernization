import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { BankDetails, ExpenseClaim } from "@/server/expenses/ports";
import {
  buildAndDownloadPaymentRegister,
  buildPaymentRegister,
  paymentRegisterFileName,
  PAYMENT_REGISTER_HEADERS,
  PAYMENT_REGISTER_SHEET_NAME,
  registerRowsToWorkbook,
  XLSX_MIME_TYPE,
} from "./payment-register-export";

const APPROVED_DETAILS: BankDetails = {
  holderName: "Ada Lovelace",
  accountNumber: "001234567890",
  ifsc: "HDFC0001234",
  bankName: "HDFC Bank",
  branch: "Indiranagar, Bengaluru",
};

const OTHER_DETAILS: BankDetails = {
  holderName: "Grace Hopper",
  accountNumber: "9876543210",
  ifsc: "ICIC0004321",
  bankName: "ICICI Bank",
  branch: "Koramangala, Bengaluru",
};

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

const DETAILS_BY_EMPLOYEE = new Map([
  ["employee-1", APPROVED_DETAILS],
  ["employee-2", OTHER_DETAILS],
]);

const NAME_BY_EMPLOYEE = new Map([
  ["employee-1", "Ada Lovelace"],
  ["employee-2", "Grace Hopper"],
]);

function dataRows(workbook: XLSX.WorkBook): unknown[][] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

describe("buildPaymentRegister", () => {
  it("maps each selected claim to a register row with the approved bank details", () => {
    const claim = buildClaim();
    const { rows, excluded } = buildPaymentRegister([claim], DETAILS_BY_EMPLOYEE, NAME_BY_EMPLOYEE);

    expect(excluded).toEqual([]);
    expect(rows).toEqual([
      {
        expenseId: "claim-1",
        employeeName: "Ada Lovelace",
        amount: 1250,
        details: APPROVED_DETAILS,
      },
    ]);
  });

  it("excludes selected claims whose requester has no approved bank details, with a report", () => {
    const withDetails = buildClaim({ id: "claim-1" });
    const withoutDetails = buildClaim({
      id: "claim-2",
      ref: "EXP-0002",
      requesterId: "employee-3",
    });
    const { rows, excluded } = buildPaymentRegister(
      [withDetails, withoutDetails],
      DETAILS_BY_EMPLOYEE,
      NAME_BY_EMPLOYEE,
    );

    expect(rows.map((row) => row.expenseId)).toEqual(["claim-1"]);
    expect(excluded).toEqual([
      { claim: withoutDetails, reason: "no-approved-bank-details" },
    ]);
  });

  it("excludes every claim when no requester has approved details", () => {
    const { rows, excluded } = buildPaymentRegister(
      [buildClaim()],
      new Map(),
      NAME_BY_EMPLOYEE,
    );

    expect(rows).toEqual([]);
    expect(excluded).toHaveLength(1);
  });

  it("keeps the selection order in the register order", () => {
    const third = buildClaim({ id: "claim-3", requesterId: "employee-2" });
    const first = buildClaim({ id: "claim-1" });
    const { rows } = buildPaymentRegister([third, first], DETAILS_BY_EMPLOYEE, NAME_BY_EMPLOYEE);
    expect(rows.map((row) => row.expenseId)).toEqual(["claim-3", "claim-1"]);
  });
});

describe("registerRowsToWorkbook", () => {
  const row = {
    expenseId: "claim-1",
    employeeName: "Ada Lovelace",
    amount: 1250,
    details: APPROVED_DETAILS,
  };

  it("uses the documented headers as the header row, in contract order", () => {
    const workbook = registerRowsToWorkbook([row]);
    expect(dataRows(workbook)[0]).toEqual([...PAYMENT_REGISTER_HEADERS]);
  });

  it("names the sheet Payment register", () => {
    const workbook = registerRowsToWorkbook([row]);
    expect(workbook.SheetNames).toEqual([PAYMENT_REGISTER_SHEET_NAME]);
  });

  it("writes employee, amount, and every bank detail field per claim", () => {
    const workbook = registerRowsToWorkbook([row]);
    const body = dataRows(workbook)[1];

    expect(body).toEqual([
      "claim-1",
      "Ada Lovelace",
      1250,
      "Ada Lovelace",
      "001234567890",
      "HDFC0001234",
      "HDFC Bank",
      "Indiranagar, Bengaluru",
    ]);
  });

  it("exports the amount as a number, not a formatted string", () => {
    const workbook = registerRowsToWorkbook([row]);
    const amount = dataRows(workbook)[1][2];
    expect(amount).toBe(1250);
    expect(typeof amount).toBe("number");
  });

  it("formats the amount cell with Excel's Indian number format", () => {
    const workbook = registerRowsToWorkbook([row]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const cell = sheet[XLSX.utils.encode_cell({ r: 1, c: 2 })] as XLSX.CellObject;
    expect(cell.v).toBe(1250);
    expect(cell.z).toContain("##");
  });

  it("keeps the expense id, account number, and IFSC as hard text so the round trip is byte-exact", () => {
    const workbook = registerRowsToWorkbook([row]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const cell = (column: number) =>
      sheet[XLSX.utils.encode_cell({ r: 1, c: column })] as XLSX.CellObject;

    expect(cell(0).v).toBe("claim-1");
    expect(cell(0).z).toBe("@");
    expect(cell(4).v).toBe("001234567890");
    expect(cell(4).z).toBe("@");
    expect(cell(5).v).toBe("HDFC0001234");
    expect(cell(5).z).toBe("@");
  });

  it("writes a row per selected claim", () => {
    const workbook = registerRowsToWorkbook([
      row,
      { ...row, expenseId: "claim-2", employeeName: "Grace Hopper", details: OTHER_DETAILS },
    ]);
    const rows = dataRows(workbook);
    expect(rows).toHaveLength(3); // header + 2 claims
    expect(rows.slice(1).map((body) => body[0])).toEqual(["claim-1", "claim-2"]);
  });

  it("produces a workbook whose serialized bytes are a real xlsx zip", () => {
    const workbook = registerRowsToWorkbook([row]);
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(new Uint8Array(bytes)[0]).toBe(0x50); // "P" of the PK zip magic
  });
});

describe("paymentRegisterFileName", () => {
  it("dates the filename from local-time parts", () => {
    const date = new Date(2026, 7, 8, 10, 30);
    expect(paymentRegisterFileName(date)).toBe("payment-register-2026-08-08.xlsx");
  });

  it("derives the date at runtime when none is given", () => {
    expect(paymentRegisterFileName()).toMatch(/^payment-register-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

describe("buildAndDownloadPaymentRegister", () => {
  it("hands the download seam the xlsx blob and the dated filename", async () => {
    const downloadBlob = vi.fn();
    const date = new Date(2026, 7, 8, 10, 30);
    const row = {
      expenseId: "claim-1",
      employeeName: "Ada Lovelace",
      amount: 1250,
      details: APPROVED_DETAILS,
    };

    buildAndDownloadPaymentRegister([row], { now: date, downloadBlob });

    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, fileName] = downloadBlob.mock.calls[0] as [Blob, string];
    expect(fileName).toBe("payment-register-2026-08-08.xlsx");
    expect(blob.type).toBe(XLSX_MIME_TYPE);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x50);
  });
});
