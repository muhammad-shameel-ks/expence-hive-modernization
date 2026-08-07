import type { ExpenseClaim } from "@/server/expenses/ports";

/**
 * A claim has a real receipt attachment when its content digest is set.
 * Legacy placeholder rows carry empty digests and must not offer preview.
 */
export function hasReceiptAttachment(claim: ExpenseClaim): boolean {
  return Boolean(claim.attachment?.contentSha256);
}

/**
 * Resolves the claim backing the open preview panel. The id may point at a
 * row that was filtered out of the table; the lookup still runs against the
 * full claim list so the panel survives filters.
 */
export function selectedClaimFor(claims: ExpenseClaim[], id: string | null): ExpenseClaim | undefined {
  if (!id) return undefined;
  return claims.find((claim) => claim.id === id);
}

/**
 * Arrow-key navigation over the filtered rows, clamped at both ends.
 * When the current id is missing from the list (a filter removed it),
 * navigation restarts from the first row (down) or the last row (up).
 */
export function stepSelection(rows: ExpenseClaim[], currentId: string | null, direction: 1 | -1): string | null {
  if (rows.length === 0) return null;
  const index = currentId ? rows.findIndex((claim) => claim.id === currentId) : -1;
  if (index === -1) return direction === 1 ? rows[0].id : rows[rows.length - 1].id;
  const next = Math.min(rows.length - 1, Math.max(0, index + direction));
  return rows[next].id;
}
