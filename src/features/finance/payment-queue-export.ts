import * as XLSX from "xlsx";
import { downloadBlob as browserDownloadBlob } from "@/lib/download-blob";
import type { ExpenseClaim } from "@/server/expenses/ports";
import {
  PAYMENT_QUEUE_COLUMNS,
  type PaymentQueueColumnTextHelpers,
} from "./payment-queue-columns";

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const SHEET_NAME = "Payment queue";

// Indian lakh/crore grouping so amounts read naturally in Excel.
const INR_NUMBER_FORMAT = "[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00";

export type PaymentQueueExportScope = "current" | "full";

export function rowsToWorkbook(
  rows: ExpenseClaim[],
  helpers: PaymentQueueColumnTextHelpers,
): XLSX.WorkBook {
  const header = PAYMENT_QUEUE_COLUMNS.map((column) => column.label);
  const body = rows.map((claim) =>
    PAYMENT_QUEUE_COLUMNS.map((column) => column.textValue(claim, helpers)),
  );
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  // Give numeric cells (amounts) Excel's Indian number format; everything
  // else stays as written.
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell && typeof cell.v === "number") cell.z = INR_NUMBER_FORMAT;
    }
  }
  sheet["!cols"] = PAYMENT_QUEUE_COLUMNS.map((column) => ({
    wch: column.id === "comments" ? 36 : Math.max(column.label.length + 4, 12),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  return workbook;
}

export function exportFileName(scope: PaymentQueueExportScope, date: Date = new Date()): string {
  const day = localDayString(date);
  return scope === "full" ? `payment-queue-${day}.xlsx` : `payment-queue-current-${day}.xlsx`;
}

// The file is named in the exporting user's local time: toISOString() is UTC,
// so a user exporting just after local midnight would get a file dated the
// previous day.
function localDayString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Builds the workbook, serializes it, and hands the file off to the browser.
 * The blob-download side effect is injectable (`downloadBlob`) so tests can
 * capture the bytes and filename without a DOM.
 */
export function buildAndDownloadXlsx(
  rows: ExpenseClaim[],
  helpers: PaymentQueueColumnTextHelpers,
  scope: PaymentQueueExportScope,
  options: { now?: Date; downloadBlob?: (blob: Blob, fileName: string) => void } = {},
): void {
  const workbook = rowsToWorkbook(rows, helpers);
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([bytes], { type: XLSX_MIME_TYPE });
  const download = options.downloadBlob ?? browserDownloadBlob;
  download(blob, exportFileName(scope, options.now));
}
