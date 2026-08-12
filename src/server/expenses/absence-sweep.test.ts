import { describe, expect, it, vi } from "vitest";
import { runAbsenceSweep } from "./absence-sweep";
import type { ExpenseClaim } from "./ports";

// The sweep worker's per-pass orchestration against the in-memory stores:
// every organization is swept once per pass, and the report names the
// claims that advanced. The per-claim catch-up behavior itself is covered
// by the expense commands tests (sweepAbsentClaims).
describe("runAbsenceSweep", () => {
  it("sweeps every organization and reports the advanced claims", async () => {
    const orgOneClaim = { id: "claim-1", ref: "EXP-2026-1", organizationId: "org-1" } as ExpenseClaim;
    const sweepAbsentClaims = vi
      .fn()
      .mockResolvedValueOnce([orgOneClaim])
      .mockResolvedValueOnce([]);
    const listOrganizations = vi.fn().mockResolvedValue(["org-1", "org-2"]);

    const report = await runAbsenceSweep(
      { sweepAbsentClaims: sweepAbsentClaims as never },
      { listOrganizations: listOrganizations as never },
    );

    expect(sweepAbsentClaims).toHaveBeenCalledTimes(2);
    expect(sweepAbsentClaims).toHaveBeenNthCalledWith(1, "org-1");
    expect(sweepAbsentClaims).toHaveBeenNthCalledWith(2, "org-2");
    expect(report).toEqual({
      organizationCount: 2,
      passes: [{ organizationId: "org-1", advanced: [orgOneClaim] }],
    });
    // org-2 advanced nothing, so it is absent from the report entirely.
    expect(report.passes).toHaveLength(1);
  });

  it("reports an empty pass when no organization has stale claims", async () => {
    const report = await runAbsenceSweep(
      { sweepAbsentClaims: vi.fn().mockResolvedValue([]) as never },
      { listOrganizations: vi.fn().mockResolvedValue(["org-1"]) as never },
    );

    expect(report).toEqual({ organizationCount: 1, passes: [] });
  });
});
