import * as XLSX from "xlsx";
import { downloadBlob as browserDownloadBlob } from "@/lib/download-blob";
import type { BankDetails, ExpenseClaim } from "@/server/expenses/ports";

// The queue exports (ADR-0010) and the register share the same xlsx MIME
// type; the constant lives on the queue export module.
import { XLSX_MIME_TYPE } from "./payment-queue-export";
export { XLSX_MIME_TYPE } from "./payment-queue-export";

// The payment register (ADR-0023, CONTEXT.md "Payment register"): the Excel
// file finance hands to the external financial processing step, one row per
// selected verified claim. Distinct from the ADR-0010 queue exports, which
// stay untouched.
//
// THE FORMAT CONTRACT: the header row below is the register format. Slice
// 08's drag-back importer matches rows by these exact header labels, so the
// order and the spelling are part of the contract - a register can be parsed
// back by this format, and a file without these headers is not a register.
// Every cell maps 1:1 from the claim and the employee's approved bank
// details (ADR-0024); claims without approved details are excluded before
// the workbook is built and reported to the user, never left half-filled.
//
// The first column, "Expense ID", is the internal expense id (claim.id) -
// the stable, uniquely-identifiable anchor of the round trip.

export const PAYMENT_REGISTER_SHEET_NAME = "Payment register";

export const PAYMENT_REGISTER_HEADERS = [
  "Expense ID",
  "Employee name",
  "Amount",
  "Account holder name",
  "Account number",
  "IFSC",
  "Bank name",
  "Branch",
] as const;

// The column ids used to apply per-cell styling; the header labels above
// are the public contract, these are the internal addresses.
const EXPENSE_ID_COLUMN = 0;
const AMOUNT_COLUMN = 2;
const ACCOUNT_NUMBER_COLUMN = 4;
const IFSC_COLUMN = 5;

// Indian lakh/crore grouping so amounts read naturally in Excel, matching
// the queue exports.
const INR_NUMBER_FORMAT = "[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00";

export type PaymentRegisterRow = {
  expenseId: string;
  employeeName: string;
  amount: number;
  details: BankDetails;
};

/** A selected claim that cannot enter the register. */
export type PaymentRegisterExclusion = {
  claim: ExpenseClaim;
  reason: "no-approved-bank-details";
};

export type PaymentRegisterBuild = {
  rows: PaymentRegisterRow[];
  excluded: PaymentRegisterExclusion[];
};

/**
 * Maps the selected claims to register rows, excluding claims whose
 * requester has no approved bank details yet (they cannot be paid until the
 * details are approved, ADR-0024). The exclusion report drives the user
 * feedback after the export.
 */
export function buildPaymentRegister(
  selectedClaims: readonly ExpenseClaim[],
  approvedBankDetailsByEmployee: ReadonlyMap<string, BankDetails>,
  employeeNameById: ReadonlyMap<string, string>,
): PaymentRegisterBuild {
  const rows: PaymentRegisterRow[] = [];
  const excluded: PaymentRegisterExclusion[] = [];
  for (const claim of selectedClaims) {
    const details = approvedBankDetailsByEmployee.get(claim.requesterId);
    if (!details) {
      excluded.push({ claim, reason: "no-approved-bank-details" });
      continue;
    }
    rows.push({
      expenseId: claim.id,
      employeeName: employeeNameById.get(claim.requesterId) ?? "-",
      amount: claim.amountMinor / 100,
      details,
    });
  }
  return { rows, excluded };
}

export function registerRowsToWorkbook(rows: readonly PaymentRegisterRow[]): XLSX.WorkBook {
  const header = [...PAYMENT_REGISTER_HEADERS];
  const body = rows.map((row) => [
    row.expenseId,
    row.employeeName,
    row.amount,
    row.details.holderName,
    row.details.accountNumber,
    row.details.ifsc,
    row.details.bankName,
    row.details.branch,
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  // Numeric cells (amounts) get Excel's Indian number format; identifiers
  // get a hard text format so Excel never coerces the all-digit account
  // number (leading zeros, 9-18 digits) or the round-trip expense id.
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (!cell) continue;
      if (col === AMOUNT_COLUMN && typeof cell.v === "number") {
        cell.z = INR_NUMBER_FORMAT;
      } else if (col === EXPENSE_ID_COLUMN || col === ACCOUNT_NUMBER_COLUMN || col === IFSC_COLUMN) {
        cell.z = "@";
      }
    }
  }
  sheet["!cols"] = PAYMENT_REGISTER_HEADERS.map((label) => ({
    wch: Math.max(label.length + 4, 12),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, PAYMENT_REGISTER_SHEET_NAME);
  return workbook;
}

export function paymentRegisterFileName(date: Date = new Date()): string {
  // The file is named in the exporting user's local time: toISOString() is
  // UTC, so a user exporting just after local midnight would get a file
  // dated the previous day.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `payment-register-${year}-${month}-${day}.xlsx`;
}

/**
 * Builds the register workbook, serializes it, and hands the file off to
 * the browser. The blob-download side effect is injectable (`downloadBlob`)
 * so tests can capture the bytes and filename without a DOM.
 */
export function buildAndDownloadPaymentRegister(
  rows: readonly PaymentRegisterRow[],
  options: { now?: Date; downloadBlob?: (blob: Blob, fileName: string) => void } = {},
): void {
  const workbook = registerRowsToWorkbook(rows);
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([bytes], { type: XLSX_MIME_TYPE });
  const download = options.downloadBlob ?? browserDownloadBlob;
  download(blob, paymentRegisterFileName(options.now));
}
