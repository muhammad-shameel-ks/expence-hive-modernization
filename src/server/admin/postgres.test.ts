import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AdminError } from "./commands";
import { PostgresAdminStore } from "./postgres";

describe("PostgresAdminStore", () => {
  it("maps a concurrent duplicate draft to a validation error", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate draft"), {
          code: "23505",
          constraint: "idx_flows_org_name_scope_draft",
        }),
      )
      .mockResolvedValueOnce(undefined);
    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const promise = store.createFlow("org-1", {
      name: "Standard reimbursement",
      scope: "All departments",
      steps: ["Manager"],
    });

    await expect(promise).rejects.toBeInstanceOf(AdminError);
    await expect(promise).rejects.toMatchObject({
      code: "validation",
      message:
        'A draft flow named "Standard reimbursement" for All departments already exists.',
    });
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
