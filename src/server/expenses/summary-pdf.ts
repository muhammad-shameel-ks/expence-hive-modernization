import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ExpenseClaim, ExpenseEmployee, ReceiptData } from "./ports";
import { latestRejectionFor } from "./rejection";

// The summary is typeset with the app's own Geist Sans (the ₹ glyph the
// Standard 14 fonts lack) from the official `geist` package. If the font
// cannot be read - packaged deployment, unusual cwd - the build falls back
// to Helvetica and notes that in the PDF rather than failing the request.
const GEIST_FONT_DIR = path.join(
  process.cwd(),
  "node_modules",
  "geist",
  "dist",
  "fonts",
  "geist-sans",
);

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LABEL_COLUMN_X = MARGIN;
const VALUE_COLUMN_X = MARGIN + 150;
const BODY_SIZE = 10;
const BODY_LINE_HEIGHT = 14;
const SECTION_SIZE = 13;
const SECTION_GAP = 10;
const TITLE_SIZE = 18;

const INK = rgb(0.15, 0.16, 0.18);
const MUTED = rgb(0.42, 0.44, 0.49);
const ACCENT = rgb(0.09, 0.2, 0.42);

export type SummaryReceipt = Pick<ReceiptData, "fileName" | "contentType" | "data">;

export type ExpenseSummaryPdfInput = {
  claim: ExpenseClaim;
  employees: ExpenseEmployee[];
  receipt?: SummaryReceipt;
};

export type ExpenseSummaryPdfOptions = {
  // Override the Geist font directory, e.g. in tests pointing at a path
  // that does not exist so the Helvetica fallback path can be exercised.
  geistFontDir?: string;
};

const STATUS_LABELS: Record<ExpenseClaim["status"], string> = {
  draft: "Draft",
  "in-approval": "In approval",
  "in-finance": "In finance",
  paid: "Paid",
  rejected: "Rejected",
};

const STEP_DECISION_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  skipped: "Skipped",
  verified: "Verified",
  paid: "Paid",
};

export async function buildExpenseSummaryPdf(
  input: ExpenseSummaryPdfInput,
  options: ExpenseSummaryPdfOptions = {},
): Promise<Uint8Array> {
  const { claim, employees, receipt } = input;
  const pdfDoc = await PDFDocument.create();
  const { font, semibold, fallback } = await embedFonts(pdfDoc, options.geistFontDir);
  const names = new Map(employees.map((employee) => [employee.id, employee.name]));
  const roleNames = new Map(
    employees.filter((employee) => employee.role).map((employee) => [employee.role!.id, employee.role!.displayName]),
  );

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number): void {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawText(
    text: string,
    x: number,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; lineHeight?: number },
  ): void {
    const size = options.size ?? BODY_SIZE;
    const fontToUse = options.font ?? font;
    const color = options.color ?? INK;
    const maxWidth = options.width ?? CONTENT_WIDTH;
    const lineHeight = options.lineHeight ?? BODY_LINE_HEIGHT;
    const textToDraw = fallback ? sanitizeForStandardFont(text) : text;
    for (const line of wrapText(textToDraw, fontToUse, size, maxWidth)) {
      // Start a new page mid-paragraph when the next line would drop below
      // the bottom margin; pdf-lib draws off-page lines without error, so
      // without this a long wrapped comment is silently clipped.
      ensureSpace(lineHeight);
      page.drawText(line, { x, y, size, font: fontToUse, color });
      y -= lineHeight;
    }
  }

  function sectionHeading(text: string): void {
    ensureSpace(SECTION_SIZE + SECTION_GAP);
    y -= SECTION_GAP;
    drawText(text, LABEL_COLUMN_X, { size: SECTION_SIZE, font: semibold, color: ACCENT, lineHeight: 20 });
    y -= 6;
  }

  function drawRule(): void {
    page.drawLine({
      start: { x: LABEL_COLUMN_X, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.8,
      color: rgb(0.82, 0.84, 0.87),
    });
    y -= 14;
  }

  drawText("Expense summary", LABEL_COLUMN_X, { size: TITLE_SIZE, font: semibold, lineHeight: 26 });
  y -= 2;
  drawText(claim.ref, LABEL_COLUMN_X, { color: MUTED, lineHeight: 16 });
  if (fallback) {
    drawText(
      "Note: fallback font in use - currency amounts may render without the rupee symbol.",
      LABEL_COLUMN_X,
      { size: 8, color: MUTED, lineHeight: 12 },
    );
  }
  drawRule();

  sectionHeading("Expense facts");
  for (const [label, value] of expenseFactRows(claim, employees, receipt)) {
    ensureSpace(BODY_LINE_HEIGHT * 2);
    drawText(label, LABEL_COLUMN_X, { color: MUTED, width: VALUE_COLUMN_X - LABEL_COLUMN_X - 12 });
    drawText(value, VALUE_COLUMN_X, { width: PAGE_WIDTH - MARGIN - VALUE_COLUMN_X });
    y -= 2;
  }

  if (claim.steps.length > 0) {
    y -= 8;
    sectionHeading("Approval journey");
    for (const step of claim.steps) {
      const roleName = stepRoleName(step.roleId, roleNames);
      const decisionLabel =
        step.status === "skipped" && step.skipReason
          ? "Auto-skipped"
          : STEP_DECISION_LABELS[step.status] ?? step.status;
      const decidedAt = step.decidedAt ? ` \u00B7 ${formatTimestamp(step.decidedAt)}` : "";
      const actorName = step.assignedActorId
        ? names.get(step.assignedActorId) ?? step.assignedActorId
        : "Unassigned";
      ensureSpace(BODY_LINE_HEIGHT * 2);
      drawText(`${roleName} - ${decisionLabel}${decidedAt}`, LABEL_COLUMN_X, { font: semibold });
      drawText(actorName, LABEL_COLUMN_X + 12, { size: 9, color: MUTED, lineHeight: 12 });
      if (step.skipReason) {
        ensureSpace(BODY_LINE_HEIGHT * 2);
        drawText(step.skipReason, LABEL_COLUMN_X + 12, { size: 9, color: MUTED, lineHeight: 12 });
        y -= 2;
      }
      y -= 2;
    }
  }

  // The comment section renders the claim's comments plus the rejection
  // reason as a read-only entry from history (ADR-0009): the reason is never
  // written into the comments field, so the two always appear together here.
  const comments = claim.comments?.trim();
  const rejection = claim.status === "rejected" ? latestRejectionFor(claim) : undefined;
  if (comments || rejection) {
    y -= 8;
    sectionHeading("Comments");
    if (comments) {
      ensureSpace(BODY_LINE_HEIGHT * 2);
      drawText(comments, LABEL_COLUMN_X, { lineHeight: 16 });
    }
    if (rejection) {
      y -= 4;
      ensureSpace(BODY_LINE_HEIGHT * 2);
      drawText("Rejection reason", LABEL_COLUMN_X, { font: semibold, size: 9, color: MUTED, lineHeight: 12 });
      if (rejection.detail?.trim()) {
        ensureSpace(BODY_LINE_HEIGHT * 2);
        drawText(rejection.detail.trim(), LABEL_COLUMN_X, { lineHeight: 16 });
        y -= 2;
      }
      ensureSpace(BODY_LINE_HEIGHT * 2);
      const actorName = rejection.actorId ? names.get(rejection.actorId) ?? rejection.actorId : "System";
      drawText(`Rejected by: ${actorName}`, LABEL_COLUMN_X, { lineHeight: 16 });
      drawText(`Rejected on: ${formatTimestamp(rejection.createdAt)}`, LABEL_COLUMN_X, { lineHeight: 16 });
    }
  }

  if (receipt) {
    await pdfDoc.attach(receipt.data, receipt.fileName, {
      mimeType: receipt.contentType,
      description: `Original receipt for ${claim.ref}`,
    });
  }

  return pdfDoc.save();
}

function expenseFactRows(
  claim: ExpenseClaim,
  employees: ExpenseEmployee[],
  receipt: SummaryReceipt | undefined,
): Array<[string, string]> {
  const requester = employees.find((employee) => employee.id === claim.requesterId);
  const rows: Array<[string, string]> = [
    ["Reference", claim.ref],
    ["Title", claim.title],
    ["Category", claim.category],
  ];
  if (claim.subCategory) rows.push(["Sub category", claim.subCategory]);
  rows.push(
    ["Amount", formatINR(claim.amountMinor)],
    ["Expense date", formatDay(claim.expenseDate)],
    ["Bill submission date", formatTimestamp(claim.submittedAt ?? claim.createdAt)],
    ["Requester", requester?.name ?? "Unknown"],
    ["Status", STATUS_LABELS[claim.status]],
  );
  if (receipt) rows.push(["Receipt", `Attached: ${receipt.fileName}`]);
  return rows;
}

function stepRoleName(roleId: string | null, roleNames: Map<string, string>): string {
  if (roleId === null) return "Team lead";
  return (
    roleNames.get(roleId) ??
    (roleId.startsWith("role-") ? roleId.replace(/^role-/, "").replace(/-/g, " ") : roleId)
  );
}

function formatINR(amountMinor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// The Standard 14 fonts carry only WinAnsi (printable ASCII plus Latin-1);
// any other code point - the ₹ symbol most importantly - makes pdf-lib
// throw while measuring or drawing. Replace ₹ with "Rs." and everything
// else outside WinAnsi with "?" so the fallback PDF still delivers the
// text instead of failing the request.
function sanitizeForStandardFont(text: string): string {
  let out = "";
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    if ((codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff)) {
      out += char;
    } else if (codePoint === 0x20b9) {
      out += "Rs.";
    } else {
      out += "?";
    }
  }
  return out;
}

async function embedFonts(
  pdfDoc: PDFDocument,
  fontDir: string | undefined,
): Promise<{ font: PDFFont; semibold: PDFFont; fallback: boolean }> {
  const regular = loadFontBytes(fontDir, "Geist-Regular.ttf");
  const semiboldBytes = loadFontBytes(fontDir, "Geist-SemiBold.ttf");
  if (regular && semiboldBytes) {
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(regular);
    const semibold = await pdfDoc.embedFont(semiboldBytes);
    return { font, semibold, fallback: false };
  }
  console.warn("Geist font files unavailable; the summary PDF falls back to Helvetica (the ₹ glyph will not render).");
  return {
    font: await pdfDoc.embedFont(StandardFonts.Helvetica),
    semibold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    fallback: true,
  };
}

function loadFontBytes(fontDir: string | undefined, fileName: string): Uint8Array | null {
  try {
    return new Uint8Array(readFileSync(path.join(fontDir ?? GEIST_FONT_DIR, fileName)));
  } catch {
    return null;
  }
}
