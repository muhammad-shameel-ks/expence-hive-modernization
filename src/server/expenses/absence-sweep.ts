import type { AdminStore } from "../admin/ports";
import type { ExpenseClaim } from "./ports";
import type { ExpenseCommands } from "./commands";

export type AbsenceSweepPass = {
  organizationId: string;
  advanced: ExpenseClaim[];
};

export type AbsenceSweepReport = {
  organizationCount: number;
  passes: AbsenceSweepPass[];
};

// One absence sweep pass (ADR-0018): every organization's in-flight claims
// are caught up against that organization's own configured absence timeout
// through the same sweepAbsentClaims command the worker calls, which in
// turn runs the identical catch-up implementation as the lazy read path -
// the two enforcement paths cannot drift. The report names the claims that
// advanced so the worker can log them; per-stage detail lives in each
// claim's history as usual.
export async function runAbsenceSweep(
  commands: Pick<ExpenseCommands, "sweepAbsentClaims">,
  adminStore: Pick<AdminStore, "listOrganizations">,
): Promise<AbsenceSweepReport> {
  const organizationIds = await adminStore.listOrganizations();
  const passes: AbsenceSweepPass[] = [];
  for (const organizationId of organizationIds) {
    const advanced = await commands.sweepAbsentClaims(organizationId);
    if (advanced.length === 0) continue;
    passes.push({ organizationId, advanced });
  }
  return { organizationCount: organizationIds.length, passes };
}
