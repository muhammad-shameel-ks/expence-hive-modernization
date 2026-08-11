// Server-side parsing of the roster CSV for the bulk employee import.
// The parser handles CSV syntax (quoted fields, escaped quotes, CRLF) and
// column shape; semantic validation (unknown roles, department heads,
// duplicates) lives in the command layer where the org context is known.

export const ROSTER_HEADER = ["name", "email", "role", "department", "manager"] as const;

export type RosterCsvRow = {
  // 1-based line number in the original file, for per-row error reports.
  rowNumber: number;
  fields: {
    name: string;
    email: string;
    role: string;
    department: string;
    // Empty or absent when the row has no manager override.
    manager: string | null;
  };
};

export type RosterParseError = {
  rowNumber: number;
  error: string;
};

export type RosterParseResult = {
  rows: RosterCsvRow[];
  errors: RosterParseError[];
};

type RawRow = { rowNumber: number; cells: string[] };

// A minimal RFC-4180 tokenizer: quoted fields may contain commas, newlines
// and escaped quotes (""), bare fields cannot. Trailing blank lines and
// fully empty rows are dropped by the caller.
function tokenizeCsv(text: string): { rows: RawRow[]; unterminatedQuote: boolean } {
  const rows: RawRow[] = [];
  let rowNumber = 1;
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let started = false;

  const finishCell = () => {
    cells.push(cell);
    cell = "";
  };
  const finishRow = () => {
    finishCell();
    rows.push({ rowNumber, cells });
    rowNumber += 1;
    cells = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") {
      inQuotes = true;
      started = true;
      continue;
    }
    if (char === ",") {
      finishCell();
      started = true;
      continue;
    }
    if (char === "\n") {
      finishRow();
      started = false;
      continue;
    }
    if (char === "\r") {
      // CRLF is one newline; a lone CR is treated as a line break too.
      if (text[index + 1] === "\n") {
        index += 1;
      }
      finishRow();
      started = false;
      continue;
    }
    started = true;
    cell += char;
  }
  if (started || cell !== "" || cells.length > 0) {
    finishRow();
  }
  return { rows, unterminatedQuote: inQuotes };
}

function isEmptyRow(row: RawRow): boolean {
  return row.cells.every((cell) => cell.trim() === "");
}

export function parseRosterCsv(text: string): RosterParseResult {
  const { rows: rawRows, unterminatedQuote } = tokenizeCsv(text);
  if (unterminatedQuote) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, error: "The CSV has an unterminated quoted field." }],
    };
  }

  const header = rawRows[0];
  const expectedHeader = `${ROSTER_HEADER.join(",")} (the manager column is optional)`;
  if (!header || isEmptyRow(header)) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, error: `The CSV needs a header row: ${expectedHeader}.` }],
    };
  }
  // The manager column may be omitted entirely; the first four columns are
  // always required.
  const headerNames = header.cells.map((cell) => cell.trim().toLowerCase());
  const expected = [...ROSTER_HEADER];
  const expectedMinimal = expected.slice(0, 4);
  const isHeader =
    JSON.stringify(headerNames) === JSON.stringify(expected) ||
    JSON.stringify(headerNames) === JSON.stringify(expectedMinimal);
  if (!isHeader) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, error: `The header row must be: ${expectedHeader}.` }],
    };
  }
  const hasManagerColumn = headerNames.length === 5;

  const rows: RosterCsvRow[] = [];
  const errors: RosterParseError[] = [];
  for (const raw of rawRows.slice(1)) {
    if (isEmptyRow(raw)) {
      continue;
    }
    const expectedColumnCount = hasManagerColumn ? 5 : 4;
    if (raw.cells.length !== expectedColumnCount) {
      errors.push({
        rowNumber: raw.rowNumber,
        error: `Row ${raw.rowNumber} has ${raw.cells.length} columns; expected ${expectedColumnCount} (name, email, role, department${hasManagerColumn ? ", manager" : ""}).`,
      });
      continue;
    }
    const [name, email, role, department, manager] = raw.cells;
    rows.push({
      rowNumber: raw.rowNumber,
      fields: {
        name: name?.trim() ?? "",
        email: email?.trim() ?? "",
        role: role?.trim() ?? "",
        department: department?.trim() ?? "",
        manager: manager?.trim() || null,
      },
    });
  }
  return { rows, errors };
}
