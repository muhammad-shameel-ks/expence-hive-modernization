/**
 * Shared batch multi-select helpers over a set of claim ids, used by both
 * the approvals inbox (ADR-0029) and the finance payment queue (ADR-0023).
 * The selection is a set of claim ids that survives filtering - a row
 * hidden by a filter stays part of the batch - so every helper returns a
 * new Set and never mutates the caller's state.
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

/** True when some but not all given row ids are selected. */
export function isSelectionIndeterminate(
  selected: ReadonlySet<string>,
  claimIds: readonly string[],
): boolean {
  const selectedCount = claimIds.filter((id) => selected.has(id)).length;
  return selectedCount > 0 && selectedCount < claimIds.length;
}
