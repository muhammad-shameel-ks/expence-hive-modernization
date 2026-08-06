import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresExpenseStore } from "./postgres";
import type { ExpenseClaim } from "./ports";

function buildClaim(): ExpenseClaim {
  return {
    id: "claim-1",
    ref: "EXP-2026-0001",
    organizationId: "org-1",
    requesterId: "emp-shameel",
    title: "Bengaluru client flight",
    category: "Travel",
    subCategory: "Airfare",
    remark: "Round trip for the Bengaluru client kickoff",
    amountMinor: 1250000,
    currency: "INR",
    expenseDate: "2026-08-04",
    status: "draft",
    payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    steps: [],
    history: [{ id: "history-1", kind: "draft", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" }],
    version: 1,
    createdAt: "2026-08-04T10:00:00.000Z",
  };
}

describe("PostgresExpenseStore", () => {
  it("persists payout details and returns them when reading the claim back", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    await store.createClaim(buildClaim());

    const insertCall = query.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO reimbursement_claims"));
    expect(insertCall?.[0]).toContain("account_number");
    expect(insertCall?.[0]).toContain("ifsc_code");
    expect(insertCall?.[0]).toContain("sub_category");
    expect(insertCall?.[0]).toContain("remark");
    expect(insertCall?.[1]).toEqual(
      expect.arrayContaining(["32534240620", "SBIN0012861", "Airfare", "Round trip for the Bengaluru client kickoff"]),
    );
  });

  it("persists comments when updating a claim", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = buildClaim();
    claim.comments = "Awaiting invoice copy before payout";
    claim.version = 2;
    await store.updateClaim(claim);

    const updateCall = query.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("UPDATE reimbursement_claims"));
    expect(updateCall?.[0]).toContain("comments");
    expect(updateCall?.[1]).toEqual(expect.arrayContaining(["Awaiting invoice copy before payout"]));
  });

  it("maps account_number and ifsc_code columns back into payoutDetails", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM reimbursement_claims")) {
        return Promise.resolve({
          rows: [
            {
              id: "claim-1",
              organization_id: "org-1",
              requester_id: "emp-shameel",
              reference: "EXP-2026-0001",
              title: "Bengaluru client flight",
              category: "Travel",
              sub_category: "Airfare",
              remark: "Round trip for the Bengaluru client kickoff",
              amount_minor: "1250000",
              expense_date: "2026-08-04",
              status: "draft",
              current_stage: null,
              current_actor_id: null,
              version: "1",
              created_at: "2026-08-04T10:00:00.000Z",
              submitted_at: null,
              account_number: "32534240620",
              ifsc_code: "SBIN0012861",
              comments: "Awaiting invoice copy before payout",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = await store.getClaim("claim-1");

    expect(claim?.payoutDetails).toEqual({ accountNumber: "32534240620", ifscCode: "SBIN0012861" });
    expect(claim).toMatchObject({
      subCategory: "Airfare",
      remark: "Round trip for the Bengaluru client kickoff",
      comments: "Awaiting invoice copy before payout",
    });
  });

  it("lists every claim in an organization regardless of requester or assigned actor", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM reimbursement_claims")) {
        expect(sql).toContain("organization_id = $1");
        expect(sql).not.toContain("requester_id = $2");
        return Promise.resolve({
          rows: [
            {
              id: "claim-1",
              organization_id: "org-1",
              requester_id: "emp-shameel",
              reference: "EXP-2026-0001",
              title: "Bengaluru client flight",
              category: "Travel",
              amount_minor: "1250000",
              expense_date: "2026-08-04",
              status: "in-finance",
              current_stage: "finance",
              current_actor_id: "emp-finance",
              version: "5",
              created_at: "2026-08-04T10:00:00.000Z",
              submitted_at: "2026-08-04T10:00:00.000Z",
              account_number: "32534240620",
              ifsc_code: "SBIN0012861",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claims = await store.listClaimsForOrganization("org-1");

    expect(claims).toHaveLength(1);
    expect(claims[0].payoutDetails).toEqual({ accountNumber: "32534240620", ifscCode: "SBIN0012861" });
  });

  it("queries an actor's activity by joining history events to their claims, filtered to the given kinds", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      expect(sql).toContain("JOIN reimbursement_claims");
      expect(params).toEqual(["org-1", "emp-ada", ["approved", "rejected"]]);
      return Promise.resolve({
        rows: [
          {
            id: "history-1",
            claim_id: "claim-1",
            kind: "approved",
            detail: null,
            created_at: "2026-08-04T10:00:00.000Z",
            reference: "EXP-2026-0001",
            title: "Bengaluru client flight",
            category: "Travel",
            amount_minor: "1250000",
            currency: "INR",
            requester_id: "emp-shameel",
            requester_name: "Muhammad Shameel",
            actor_id: "emp-ada",
            actor_name: "Ada Lovelace",
          },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const activity = await store.listActivityForActor("org-1", "emp-ada", ["approved", "rejected"]);

    expect(activity).toEqual([
      {
        id: "history-1",
        claimId: "claim-1",
        claimRef: "EXP-2026-0001",
        claimTitle: "Bengaluru client flight",
        claimCategory: "Travel",
        claimAmountMinor: 1250000,
        claimCurrency: "INR",
        requesterId: "emp-shameel",
        requesterName: "Muhammad Shameel",
        actorId: "emp-ada",
        actorName: "Ada Lovelace",
        kind: "approved",
        detail: undefined,
        createdAt: "2026-08-04T10:00:00.000Z",
      },
    ]);
  });

  it("queries every actor's activity in the organization, not just one actor's", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      expect(sql).not.toContain("che.actor_id = $2");
      expect(sql).toContain("che.actor_id IS NOT NULL");
      expect(params).toEqual(["org-1", ["approved", "rejected"]]);
      return Promise.resolve({
        rows: [
          {
            id: "history-1",
            claim_id: "claim-1",
            kind: "rejected",
            detail: "Missing itemized receipt",
            created_at: "2026-08-04T10:00:00.000Z",
            reference: "EXP-2026-0001",
            title: "Client dinner",
            category: "Meals",
            amount_minor: "24000",
            currency: "INR",
            requester_id: "emp-shameel",
            requester_name: "Muhammad Shameel",
            actor_id: "emp-ada",
            actor_name: "Ada Lovelace",
          },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const activity = await store.listActivityForOrganization("org-1", ["approved", "rejected"]);

    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ actorId: "emp-ada", actorName: "Ada Lovelace", kind: "rejected" });
  });

  it("employee queries select the active flag and the hierarchy manager id", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      expect(sql).toContain("e.active");
      expect(sql).toContain("LEFT JOIN hierarchy_assignments ha ON ha.employee_id = e.id");
      expect(sql).toContain("ha.manager_id");
      return Promise.resolve({
        rows: [
          {
            id: "emp-1",
            organization_id: "org-1",
            name: "Ananya Iyer",
            department_id: "dept-1",
            active: true,
            role_id: "role-intern",
            role_code: "intern",
            role_name: "Intern",
            role_department_id: null,
            manager_id: "emp-2",
          },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const employee = await store.getEmployee("emp-1");

    expect(employee).toMatchObject({
      id: "emp-1",
      active: true,
      managerId: "emp-2",
      departmentId: "dept-1",
    });
  });

  it("maps an absent active flag and manager to inactive with no manager", async () => {
    const poolQuery = vi.fn().mockImplementation(() =>
      Promise.resolve({
        rows: [
          {
            id: "emp-1",
            organization_id: "org-1",
            name: "Ananya Iyer",
            department_id: null,
            active: false,
            role_id: null,
            role_code: null,
            role_name: null,
            role_department_id: null,
            manager_id: null,
          },
        ],
      }),
    );
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const employee = await store.getEmployee("emp-1");

    expect(employee).toMatchObject({ active: false, managerId: null, role: null });
  });

  it("loads flow steps with their target kind, mapping team-lead steps to a null role id", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes("FROM flows WHERE organization_id = $1 AND role_id = $2")) {
        expect(params).toEqual(["org-1", "role-intern"]);
        return Promise.resolve({ rows: [{ id: "flow-intern", role_id: "role-intern" }] });
      }
      expect(sql).toContain("SELECT kind, role_id FROM flow_steps");
      expect(params).toEqual(["flow-intern"]);
      return Promise.resolve({
        rows: [
          { kind: "team-lead", role_id: null },
          { kind: "role", role_id: "role-manager" },
          { kind: "role", role_id: "role-finance-executive" },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const flow = await store.getPublishedFlowForRole("org-1", "role-intern");

    expect(flow?.steps).toEqual([
      { kind: "team-lead" },
      { kind: "role", roleId: "role-manager" },
      { kind: "role", roleId: "role-finance-executive" },
    ]);
  });

  it("returns null when the role has no published flow, without a most-recently-created fallback", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      expect(sql).toContain("role_id = $2");
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const flow = await store.getPublishedFlowForRole("org-1", "role-executive");

    expect(flow).toBeNull();
    expect(poolQuery).toHaveBeenCalledOnce();
  });

  it("maps a claim step with a null role id (team-lead stage) back to the claim", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM reimbursement_claims")) {
        return Promise.resolve({
          rows: [
            {
              id: "claim-1",
              organization_id: "org-1",
              requester_id: "emp-intern",
              reference: "EXP-2026-0001",
              title: "Intern cab ride",
              category: "Travel",
              amount_minor: "45000",
              expense_date: "2026-08-04",
              status: "in-approval",
              current_stage: null,
              current_actor_id: "emp-abilash",
              version: "2",
              created_at: "2026-08-04T10:00:00.000Z",
              submitted_at: "2026-08-04T10:00:00.000Z",
            },
          ],
        });
      }
      if (sql.includes("FROM claim_approval_steps")) {
        return Promise.resolve({
          rows: [
            {
              id: "step-1",
              claim_id: "claim-1",
              role_id: null,
              assigned_actor_id: "emp-abilash",
              status: "pending",
              decided_at: null,
            },
            {
              id: "step-2",
              claim_id: "claim-1",
              role_id: "role-finance-executive",
              assigned_actor_id: "emp-finance",
              status: "pending",
              decided_at: null,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = await store.getClaim("claim-1");

    expect(claim?.steps).toEqual([
      { id: "step-1", roleId: null, assignedActorId: "emp-abilash", status: "pending", decidedAt: undefined },
      { id: "step-2", roleId: "role-finance-executive", assignedActorId: "emp-finance", status: "pending", decidedAt: undefined },
    ]);
  });

  it("writes a claim step with a null role id for a team-lead stage", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = buildClaim();
    claim.status = "in-approval";
    claim.currentStage = undefined;
    claim.version = 2;
    claim.steps = [
      { id: "step-1", roleId: null, assignedActorId: "emp-abilash", status: "pending" },
      { id: "step-2", roleId: "role-finance-executive", assignedActorId: "emp-finance", status: "pending" },
    ];
    await store.updateClaim(claim);

    const stepInsert = query.mock.calls.find(
      ([sql, values]) => typeof sql === "string" && sql.includes("INSERT INTO claim_approval_steps") && Array.isArray(values) && values.includes("step-1"),
    );
    expect(stepInsert?.[1]).toEqual(expect.arrayContaining([null, "emp-abilash"]));
  });
});
