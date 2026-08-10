export type AmountGuardOperator = "gte" | "gt" | "lte" | "lt";

// An amount guard on a flow step: the step runs only when the claim total
// satisfies the operator against amountMinor (a positive integer in paise).
export type AmountGuard = {
  operator: AmountGuardOperator;
  amountMinor: number;
};

export const GUARD_OPERATOR_LABELS: Record<AmountGuardOperator, string> = {
  gte: "At least (≥)",
  gt: "Greater than (>)",
  lte: "At most (≤)",
  lt: "Less than (<)",
};

export const GUARD_OPERATORS: AmountGuardOperator[] = Object.keys(
  GUARD_OPERATOR_LABELS,
) as AmountGuardOperator[];

// The user-facing phrase of each operator as "the claim total is [phrase]
// the guard amount": gte fails under the amount, gt fails at or under it,
// lte fails above it, and lt fails at or above it.
export const GUARD_FAIL_PHRASES: Record<AmountGuardOperator, string> = {
  gte: "under",
  gt: "at or under",
  lte: "above",
  lt: "at or above",
};

export function rupeesToMinor(rupees: string): number | null {
  const trimmed = rupees.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function minorToRupees(amountMinor: number | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined) return "";
  return (amountMinor / 100).toFixed(2).replace(/\.00$/, "");
}

export function formatGuardAmount(amountMinor: number): string {
  if (amountMinor % 100 === 0) return `₹${amountMinor / 100}`;
  return `₹${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, "0")}`;
}

export function guardSatisfied(guard: AmountGuard, totalMinor: number): boolean {
  switch (guard.operator) {
    case "gte":
      return totalMinor >= guard.amountMinor;
    case "gt":
      return totalMinor > guard.amountMinor;
    case "lte":
      return totalMinor <= guard.amountMinor;
    case "lt":
      return totalMinor < guard.amountMinor;
  }
}

// The auto-skip history detail names the failing guard and the step the
// policy waived, e.g. "Total ₹300 under ₹5000 guard on Finance Head step".
export function autoSkipDetail(
  totalMinor: number,
  guard: AmountGuard,
  stepRoleName: string,
): string {
  return `Total ${formatGuardAmount(totalMinor)} ${GUARD_FAIL_PHRASES[guard.operator]} ${formatGuardAmount(guard.amountMinor)} guard on ${stepRoleName} step`;
}

// Maps a DB row containing guard_operator and guard_amount_minor columns
// to an AmountGuard object or null if unguarded.
export function guardFromRow(row: {
  guard_operator?: unknown;
  guard_amount_minor?: unknown;
}): AmountGuard | null {
  if (row.guard_operator === null || row.guard_operator === undefined) {
    return null;
  }
  return {
    operator: String(row.guard_operator) as AmountGuardOperator,
    amountMinor: Number(row.guard_amount_minor),
  };
}

// A short user-facing reason for an amount-guard auto-skip, e.g. "under ₹2000".
// The full audit detail ("Total ₹1999 at or under ₹2000 guard on Finance Head step")
// stays in history; the journey timeline shows just the condition.
export function simplifyAutoSkipDetail(detail: string): string {
  const match = detail.match(
    /^(?:Total ₹[\d.,]+ )?(at or under|under|above|at or above) ₹([\d.,]+) guard/,
  );
  if (!match) return detail;
  return `${match[1]} ₹${match[2]}`;
}
