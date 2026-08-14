import { describe, expect, it } from "vitest";
import {
  isSelectionAllSelected,
  isSelectionIndeterminate,
  toggleAllSelection,
  toggleClaimSelection,
} from "./approvals-selection";

describe("approvals-selection", () => {
  it("toggles single claim selection adding and removing from the set", () => {
    const empty = new Set<string>();
    const withOne = toggleClaimSelection(empty, "claim-1");
    expect(Array.from(withOne)).toEqual(["claim-1"]);

    const withoutOne = toggleClaimSelection(withOne, "claim-1");
    expect(Array.from(withoutOne)).toEqual([]);
  });

  it("toggles all claims: selects all if some or none selected, clears if all selected", () => {
    const empty = new Set<string>();
    const allIds = ["claim-1", "claim-2", "claim-3"];

    const allSelected = toggleAllSelection(empty, allIds);
    expect(Array.from(allSelected).sort()).toEqual(["claim-1", "claim-2", "claim-3"]);

    const cleared = toggleAllSelection(allSelected, allIds);
    expect(Array.from(cleared)).toEqual([]);

    const partial = new Set(["claim-1"]);
    const allFromPartial = toggleAllSelection(partial, allIds);
    expect(Array.from(allFromPartial).sort()).toEqual(["claim-1", "claim-2", "claim-3"]);
  });

  it("evaluates isSelectionAllSelected correctly", () => {
    const allIds = ["claim-1", "claim-2"];
    expect(isSelectionAllSelected(new Set(["claim-1", "claim-2"]), allIds)).toBe(true);
    expect(isSelectionAllSelected(new Set(["claim-1"]), allIds)).toBe(false);
    expect(isSelectionAllSelected(new Set(), allIds)).toBe(false);
    expect(isSelectionAllSelected(new Set(), [])).toBe(false);
  });

  it("evaluates isSelectionIndeterminate correctly", () => {
    const allIds = ["claim-1", "claim-2", "claim-3"];
    expect(isSelectionIndeterminate(new Set(["claim-1"]), allIds)).toBe(true);
    expect(isSelectionIndeterminate(new Set(["claim-1", "claim-2"]), allIds)).toBe(true);
    expect(isSelectionIndeterminate(new Set(["claim-1", "claim-2", "claim-3"]), allIds)).toBe(false);
    expect(isSelectionIndeterminate(new Set(), allIds)).toBe(false);
  });
});
