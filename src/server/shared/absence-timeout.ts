// The company-wise absence auto-skip setting (ADR-0018): one value per
// organization, configurable by Superadmin and enforced by both the lazy
// read-path catch-up and the scheduled sweep worker. The compile-time
// ABSENCE_TIMEOUT_MS constant of the expense commands is demoted to this
// default; every path resolves the org's configured value through the
// settings seam and falls back here when no row exists.

export const DEFAULT_ABSENCE_TIMEOUT_DAYS = 3;

// The command layer's validation ceiling: the sweep and the lazy path never
// see a value above this, and the organization_settings CHECK constraint
// enforces the same bound in the database.
export const MAX_ABSENCE_TIMEOUT_DAYS = 90;

export function absenceTimeoutMillis(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}
