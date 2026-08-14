/**
 * The batch multi-select helpers for the approvals inbox (ADR-0029):
 * managers and finance heads cherry-pick claims awaiting their approval
 * for bulk approval. The selection is a set of claim IDs that survives
 * filtering, returning a new Set on every operation without mutating state.
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

export function isSelectionAllSelected(
  selected: ReadonlySet<string>,
  claimIds: readonly string[],
): boolean {
  return claimIds.length > 0 && claimIds.every((claimId) => selected.has(claimId));
}

export function isSelectionIndeterminate(
  selected: ReadonlySet<string>,
  claimIds: readonly string[],
): boolean {
  const selectedCount = claimIds.filter((id) => selected.has(id)).length;
  return selectedCount > 0 && selectedCount < claimIds.length;
}
