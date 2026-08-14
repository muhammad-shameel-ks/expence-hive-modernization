import type { ReceiptSuggestion } from "./ports";

// The deterministic text-layer heuristics behind the local extraction
// adapter (ADR-0025). Every function is pure: given the text layer of a PDF
// receipt, it returns the same suggestions every run, which keeps the local
// adapter deterministic for tests. The category guess uses the app's fixed
// category catalog (Travel, Meals, Software, Hardware, Training) and is
// deliberately conservative: no keyword hit means no guess.

// The app's category catalog, mirrored from the draft form. The server side
// owns the guess keywords because category drives policy behavior.
export const CATEGORY_CATALOG = [
  "Travel",
  "Meals",
  "Software",
  "Hardware",
  "Training",
] as const;

export type ReceiptCategory = (typeof CATEGORY_CATALOG)[number];

const CATEGORY_KEYWORDS: Record<ReceiptCategory, readonly string[]> = {
  Travel: [
    "flight",
    "airfare",
    "airline",
    "air india",
    "indigo",
    "vistara",
    "cab",
    "taxi",
    "uber",
    "ola",
    "rapido",
    "fuel",
    "petrol",
    "diesel",
    "parking",
    "toll",
    "train",
    "railway",
    "irctc",
    "bus",
    "hotel",
    "lodging",
    "car rent",
    "carrental",
    "travel",
  ],
  Meals: [
    "restaurant",
    "cafe",
    "coffee",
    "tea",
    "breakfast",
    "lunch",
    "dinner",
    "food",
    "meal",
    "zomato",
    "swiggy",
    "dominos",
    "pizza",
    "burger",
    "snacks",
    "biryani",
    "refreshment",
    "dining",
    "bar",
  ],
  Software: [
    "software",
    "license",
    "subscription",
    "saas",
    "cloud",
    "aws",
    "azure",
    "google cloud",
    "microsoft",
    "adobe",
    "github",
    "vercel",
    "figma",
    "slack",
    "notion",
    "zoom",
    "jenkins",
    "datadog",
    "app",
    "tool",
  ],
  Hardware: [
    "laptop",
    "notebook",
    "monitor",
    "keyboard",
    "mouse",
    "cable",
    "adapter",
    "charger",
    "printer",
    "scanner",
    "router",
    "equipment",
    "hardware",
    "macbook",
    "dell",
    "hp ",
    "lenovo",
    "iphone",
    "phone",
    "headset",
    "webcam",
    "repair",
  ],
  Training: [
    "course",
    "certification",
    "training",
    "workshop",
    "conference",
    "seminar",
    "bootcamp",
    "udemy",
    "coursera",
    "pluralsight",
    "edx",
    "exam",
    "fee",
  ],
};

// Labels that mark a line as a document structure line rather than a
// merchant name; a vendor line is the first substantive business line, so
// these are excluded up front.
const DATE_LABEL_PATTERN = /(^|\s)(date|transaction date|purchase date|billed on|dated|date of purchase|date of issue)(\s|:)/i;

// Total labels, ordered by priority: the most specific total wins over the
// generic ones, so a "grand total" beats a line-item "amount".
const TOTAL_LABEL_PRIORITY: Array<{ pattern: RegExp; priority: number }> = [
  { pattern: /grand total/i, priority: 5 },
  { pattern: /total due|amount due|balance due|payable|amount payable/i, priority: 4 },
  { pattern: /total/i, priority: 3 },
  { pattern: /amount paid|paid/i, priority: 2 },
  { pattern: /amount/i, priority: 1 },
];

const CURRENCY_TOKEN_PATTERN = /(?:rs\.?|inr|rupees|\u20b9|usd|\$|\u20ac|eur|\u00a3|gbp)\s*([\d,]+(?:\.\d{1,2})?)/i;

const AMOUNT_NUMBER_PATTERN = /([\d,]+(?:\.\d{1,2})?)/;

// A "total items"/"total qty" line carries a count, not money; it must
// never satisfy the total-label amount path.
const COUNT_LABEL_PATTERN = /total\s+(items?|qty|quantity|count|no\.?|number|pieces|pcs)/i;

// A line qualifies as a currency line when it carries an explicit currency
// token; unmarked amounts (rare outside a labeled total) are only accepted
// through the label path below.
export function looksLikeCurrencyLine(line: string): boolean {
  return CURRENCY_TOKEN_PATTERN.test(line);
}

function parseDecimalAmount(value: string): number | null {
  const digits = value.replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(digits)) return null;
  const [whole, fraction = ""] = digits.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

// The suggested total in minor units. Labeled totals win in priority order
// (grand total first, then due amounts, then total, then paid, then any
// amount); unlabeled currency lines are a fallback that takes the largest
// figure, because a receipt's payable total is usually its largest amount.
export function extractAmount(text: string): number | undefined {
  const receiptLines = lines(text);

  let best: { priority: number; amountMinor: number } | null = null;
  for (const line of receiptLines) {
    if (COUNT_LABEL_PATTERN.test(line)) continue;
    for (const { pattern, priority } of TOTAL_LABEL_PRIORITY) {
      if (!pattern.test(line)) continue;
      const match = line.match(CURRENCY_TOKEN_PATTERN) ?? line.match(AMOUNT_NUMBER_PATTERN);
      if (!match) continue;
      const amountMinor = parseDecimalAmount(match[1]);
      if (amountMinor === null) continue;
      // Later lines win at equal priority: the payable total sits at the
      // bottom of the receipt, so the last labeled occurrence is the most
      // likely final figure.
      if (best === null || priority >= best.priority) {
        best = { priority, amountMinor };
      }
      break;
    }
  }
  if (best !== null) return best.amountMinor;

  let largest: number | undefined;
  for (const line of receiptLines) {
    const match = line.match(CURRENCY_TOKEN_PATTERN);
    if (!match) continue;
    const amountMinor = parseDecimalAmount(match[1]);
    if (amountMinor === null) continue;
    if (largest === undefined || amountMinor > largest) largest = amountMinor;
  }
  return largest;
}

const DATE_PATTERNS: Array<{ pattern: RegExp; parse: (match: RegExpMatchArray) => string | null }> = [
  {
    // ISO: 2026-08-14 or 2026.08.14
    pattern: /\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/,
    parse: (m) => normalizeDate(Number(m[1]), Number(m[2]), Number(m[3])),
  },
  {
    // 14-Aug-2026, 14 AUG 2026, 14th August 2026
    pattern: /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s-]+(\d{4})\b/i,
    parse: (m) => {
      const month = MONTH_INDEX[m[2].toLowerCase()];
      return month === undefined ? null : normalizeDate(Number(m[3]), month, Number(m[1]));
    },
  },
  {
    // Aug 14, 2026 / August 14th, 2026
    pattern: /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.]? (\d{1,2})[a-z]{0,2},? (\d{4})\b/i,
    parse: (m) => {
      const month = MONTH_INDEX[m[1].toLowerCase()];
      return month === undefined ? null : normalizeDate(Number(m[3]), month, Number(m[2]));
    },
  },
  {
    // dd/mm/yyyy and mm/dd/yyyy. This application is INR-only, so a fully
    // ambiguous pair (both parts <= 12) is read as day-first, the Indian
    // convention; when exactly one part exceeds 12 it is unambiguous.
    pattern: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/,
    parse: (m) => {
      const first = Number(m[1]);
      const second = Number(m[2]);
      const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
      if (year < 2000 || year > 2099) return null;
      if (first > 12 && second <= 12) return normalizeDate(year, second, first);
      if (second > 12 && first <= 12) return normalizeDate(year, first, second);
      return normalizeDate(year, second, first);
    },
  },
];

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function normalizeDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const iso = date.toISOString().slice(0, 10);
  // The draft form accepts dates from the current century; anything else is
  // a misread and must not become a suggestion.
  return year >= 2000 && year <= 2099 ? iso : null;
}

// The suggested transaction date as YYYY-MM-DD. A line whose label mentions
// a date keyword is checked first; otherwise the first parseable date in the
// document wins, because receipts print their date near the top.
export function extractDate(text: string): string | undefined {
  const receiptLines = lines(text);

  const datedLines = receiptLines.filter((line) => DATE_LABEL_PATTERN.test(line));
  for (const line of datedLines.length > 0 ? datedLines : receiptLines) {
    for (const { pattern, parse } of DATE_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const date = parse(match);
      if (date !== null) return date;
    }
  }
  return undefined;
}

const VENDOR_BLOCKLIST_PATTERN =
  /^(receipt|invoice|tax invoice|bill|cash memo|payment|sale|order|estimate|quotation|statement|total|subtotal|amount|grand total|due|paid|cash|card|upi|gst|vat|tax|date|time|phone|tel|email|www|http|address|gstin|thank|visit|store|branch)\b/i;

// The suggested merchant name. Receipts print their merchant at the top, so
// the vendor is the first substantive line that is not a structure label,
// not a date, and not a bare amount line. A line is trusted when it reads
// like a business name: two or more words, a known corporate suffix, an
// all-caps single word (STARBUCKS, IKEA, DMART), or a single capitalized
// word (Swiggy, Uber), which keeps stray "RECEIPT" headings and QR lines out.
export function extractVendor(text: string): string | undefined {
  for (const line of lines(text)) {
    if (VENDOR_BLOCKLIST_PATTERN.test(line)) continue;
    if (DATE_LABEL_PATTERN.test(line)) continue;
    if (looksLikeCurrencyLine(line)) continue;
    if (line.length < 3 || line.length > 80) continue;
    const allCapsWord = /^[A-Z0-9&.'-]{3,}$/.test(line) && line === line.toUpperCase();
    const capitalizedWord = /^[A-Z][a-z]{2,}$/.test(line);
    if (
      !allCapsWord &&
      !capitalizedWord &&
      !/(?:[A-Za-z]{2,} ){1,}[A-Za-z]{2,}|(?:inc|llc|ltd|pvt|corp|company|store|cafe|restaurant|hotel|airlines|airways|transport|services|solutions|technologies|officemart|traders|enterprises|mart|supermarket|bazaar|systems|software|digital|studio|salon|gym|hospital|clinic|pharmacy|medical|travels|tours|resorts|group|university|institute|academy|school|college|lab|works|industries|products|retail|wholesale|distributors|agencies|agency|pvt\.? ltd\.?|ltd\.? co\.?)/i.test(line)
    ) {
      continue;
    }
    return line;
  }
  return undefined;
}

// The best-effort category guess. Each line is scored by the keywords it
// contains; the category with the highest score wins. No keyword hit returns
// no guess. The tie-break is catalog order, which favors the more common
// expense categories (Travel, Meals).
export function extractCategoryGuess(text: string): string | undefined {
  const normalized = text.toLowerCase();
  let bestCategory: ReceiptCategory | undefined;
  let bestScore = 0;
  for (const category of CATEGORY_CATALOG) {
    let score = 0;
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      if (normalized.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  return bestScore > 0 ? bestCategory : undefined;
}

// Runs the full heuristic set over an extracted text layer. Deterministic
// by construction: same text in, same suggestions out.
export function suggestFromText(text: string): ReceiptSuggestion {
  const suggestion: ReceiptSuggestion = {};
  const amountMinor = extractAmount(text);
  if (amountMinor !== undefined) suggestion.amountMinor = amountMinor;
  const date = extractDate(text);
  if (date !== undefined) suggestion.date = date;
  const vendor = extractVendor(text);
  if (vendor !== undefined) suggestion.vendor = vendor;
  const categoryGuess = extractCategoryGuess(text);
  if (categoryGuess !== undefined) suggestion.categoryGuess = categoryGuess;
  return suggestion;
}
