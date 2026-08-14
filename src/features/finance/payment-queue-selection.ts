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

/**
 * The batch multi-select (ADR-0023): finance cherry-picks verified claims
 * for the payment register export and bulk pay. The selection is a set of
 * claim ids that survives filtering - a row hidden by a filter stays part
 * of the batch - so every helper returns a new Set and never mutates the
 * caller's state.
 */

export function toggleClaimSelection(
  selected: ReadonlySet<string>,
  claimId: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(claimId)) {
    next.delete(claimId);
  } else {
    next.add(claimId);
  }
  return next;
}

/**
 * The select-all toggle over the given row ids: selecting all of them
 * clears the whole batch, any other state selects exactly those ids.
 */
export function toggleAllSelection(
  selected: ReadonlySet<string>,
  claimIds: readonly string[],
): Set<string> {
  const next = new Set(selected);
  if (isSelectionAllSelected(selected, claimIds)) {
    for (const claimId of claimIds) next.delete(claimId);
  } else {
    for (const claimId of claimIds) next.add(claimId);
  }
  return next;
}

/** True when every given row id is selected (and at least one exists). */
export function isSelectionAllSelected(
  selected: ReadonlySet<string>,
  claimIds: readonly string[],
): boolean {
  return claimIds.length > 0 && claimIds.every((claimId) => selected.has(claimId));
}
