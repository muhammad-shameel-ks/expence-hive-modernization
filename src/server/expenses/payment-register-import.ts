import * as XLSX from "xlsx";
import { PAYMENT_REGISTER_HEADERS } from "@/features/finance/payment-register-export";

// The drag-back half of the payment register round trip (ADR-0023): the
// exported Excel file is uploaded to a protected server route and parsed
// HERE, in the server process - parsing never happens in the browser.
//
// The file is validated against the slice-06 format contract: the header
// row must carry every PAYMENT_REGISTER_HEADERS label in contract order,
// so a file that is not a register export (or a register whose columns
// were reworked) is rejected with a clear message instead of being matched
// against misaligned cells. The round-trip anchor is the "Expense ID"
// column (hard-text cells on export); trailing columns beyond the contract
// are tolerated so the external financial processing step can append its
// own status notes without breaking the round trip.

export type PaymentRegisterParseFailure = "not-excel" | "not-a-register";

export type PaymentRegisterParseResult =
  | { ok: true; expenseIds: string[] }
  | { ok: false; failure: PaymentRegisterParseFailure; message: string };

export function notARegisterMessage(): string {
  return "This file is not a payment register export. Export the register from the payment queue first and drag that file back.";
}

export function notExcelMessage(): string {
  return "The uploaded file is not a valid Excel workbook. Export the register from the payment queue as .xlsx and drag that file back.";
}

/** Parses raw uploaded bytes into the expense ids of a register workbook. */
export function parsePaymentRegisterData(data: Uint8Array): PaymentRegisterParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array" });
  } catch {
    return { ok: false, failure: "not-excel", message: notExcelMessage() };
  }
  return parsePaymentRegisterWorkbook(workbook);
}

/** Validates the workbook against the register format and extracts the expense ids. */
export function parsePaymentRegisterWorkbook(workbook: XLSX.WorkBook): PaymentRegisterParseResult {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { ok: false, failure: "not-a-register", message: notARegisterMessage() };
  let rows: unknown[][];
  try {
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  } catch {
    return { ok: false, failure: "not-a-register", message: notARegisterMessage() };
  }
  const header = rows[0] ?? [];
  for (let column = 0; column < PAYMENT_REGISTER_HEADERS.length; column += 1) {
    if (String(header[column]).trim() !== PAYMENT_REGISTER_HEADERS[column]) {
      return { ok: false, failure: "not-a-register", message: notARegisterMessage() };
    }
  }
  // The first column is the round-trip anchor; later columns only ever
  // reference it, so the ids are all the import needs. Blank rows and
  // duplicate rows are ignored - a row already in the file pays once.
  const expenseIds: string[] = [];
  const seen = new Set<string>();
  for (let row = 1; row < rows.length; row += 1) {
    const rowCells = rows[row];
    if (!rowCells || rowCells.every((cell) => String(cell).trim() === "")) continue;
    const raw = rowCells[0];
    const expenseId = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!expenseId || seen.has(expenseId)) continue;
    seen.add(expenseId);
    expenseIds.push(expenseId);
  }
  return { ok: true, expenseIds };
}
