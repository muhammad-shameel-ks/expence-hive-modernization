/**
 * The batch multi-select helpers for the approvals inbox (ADR-0029):
 * managers and finance heads cherry-pick claims awaiting their approval
 * for bulk approval. The selection is a set of claim IDs that survives
 * filtering, returning a new Set on every operation without mutating state.
 */

export {
  isSelectionAllSelected,
  isSelectionIndeterminate,
  toggleAllSelection,
  toggleClaimSelection,
} from "@/lib/claim-selection";
