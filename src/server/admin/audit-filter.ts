import type { AuditFilter } from "./ports";

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Shared by the pg and in-memory stores so both apply identical date
// semantics. A bare YYYY-MM-DD means the full day in UTC: `from` starts at
// midnight of that day (inclusive) and `to` is an inclusive end-of-day whose
// exclusive upper bound is midnight of the following day. Full ISO instants
// are used as-is; a `to` instant stays exclusive.
export function auditRangeBounds(filter: AuditFilter): {
  from: Date | null;
  to: Date | null;
} {
  return {
    from: filter.from ? parseDateOrDayStart(filter.from) : null,
    to: filter.to ? parseExclusiveUpperBound(filter.to) : null,
  };
}

function parseDateOrDayStart(value: string): Date {
  return BARE_DATE.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
}

function parseExclusiveUpperBound(value: string): Date {
  if (!BARE_DATE.test(value)) {
    return new Date(value);
  }
  const nextDay = new Date(`${value}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay;
}
