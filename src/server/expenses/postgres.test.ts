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
    steps: [],
    history: [{ id: "history-1", kind: "draft", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" }],
    version: 1,
    createdAt: "2026-08-04T10:00:00.000Z",
  };
}

describe("PostgresExpenseStore", () => {
  it("persists claim fields when saving a claim", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    await store.createClaim(buildClaim());

    const insertCall = query.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO reimbursement_claims"));
    expect(insertCall?.[0]).toContain("sub_category");
    expect(insertCall?.[0]).toContain("remark");
    expect(insertCall?.[1]).toEqual(
      expect.arrayContaining(["Airfare", "Round trip for the Bengaluru client kickoff"]),
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

  it("maps sub_category, remark, and comments columns back into claim", async () => {
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
  });

  it("lists in-finance claims for any holder of the terminal stage's role, not just the assigned actor", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes("FROM reimbursement_claims")) {
        expect(sql).toContain("rc.status = 'in-finance'");
        expect(sql).toContain("claim_approval_steps s");
        expect(sql).toContain("employee_roles er");
        expect(sql).toContain("s.status IN ('pending', 'verified')");
        expect(params).toEqual(["org-1", "emp-finance-2"]);
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const employee = {
      id: "emp-finance-2",
      organizationId: "org-1",
      name: "Rishikesh 2",
      role: { id: "role-finance-executive", code: "finance-executive", displayName: "Finance Executive" },
      active: true,
      managerId: null,
    };

    const claims = await store.listClaimsForEmployee(employee);

    expect(claims).toEqual([]);
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

  it("maps the role's six privilege toggles onto the employee's role record", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      expect(sql).toContain("r.can_approve AS role_can_approve");
      expect(sql).toContain("r.can_hold AS role_can_hold");
      return Promise.resolve({
        rows: [
          {
            id: "emp-1",
            organization_id: "org-1",
            name: "Ada Lovelace",
            department_id: "dept-1",
            active: true,
            role_id: "role-manager",
            role_code: "manager",
            role_name: "Manager",
            role_department_id: null,
            role_can_submit: true,
            role_can_approve: true,
            role_can_access_finance: false,
            role_can_hold: false,
            role_can_view_org_activity: false,
            role_can_access_admin_console: false,
            manager_id: null,
          },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const employee = await store.getEmployee("emp-1");

    expect(employee?.role).toEqual({
      id: "role-manager",
      code: "manager",
      displayName: "Manager",
      departmentId: null,
      capabilities: {
        canSubmit: true,
        canApprove: true,
        canAccessFinance: false,
        canHold: false,
        canViewOrganizationActivity: false,
        canAccessAdminConsole: false,
      },
    });
  });

  it("maps a role row without capability columns to a record with no capability set", async () => {
    const poolQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "emp-1",
          organization_id: "org-1",
          name: "Ada Lovelace",
          department_id: null,
          active: true,
          role_id: "role-manager",
          role_code: "manager",
          role_name: "Manager",
          role_department_id: null,
          manager_id: null,
        },
      ],
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const employee = await store.getEmployee("emp-1");

    expect(employee?.role).toEqual({
      id: "role-manager",
      code: "manager",
      displayName: "Manager",
      departmentId: null,
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
      expect(sql).toContain("SELECT kind, role_id, guard_operator, guard_amount_minor FROM flow_steps");
      expect(params).toEqual(["flow-intern"]);
      return Promise.resolve({
        rows: [
          { kind: "team-lead", role_id: null, guard_operator: null, guard_amount_minor: null },
          { kind: "role", role_id: "role-manager", guard_operator: null, guard_amount_minor: null },
          { kind: "role", role_id: "role-finance-executive", guard_operator: null, guard_amount_minor: null },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const flow = await store.getPublishedFlowForRole("org-1", "role-intern");

    expect(flow?.steps).toEqual([
      { kind: "team-lead", guard: null },
      { kind: "role", roleId: "role-manager", guard: null },
      { kind: "role", roleId: "role-finance-executive", guard: null },
    ]);
  });

  it("maps amount guards back from published flow steps", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes("FROM flows WHERE organization_id = $1 AND role_id = $2")) {
        expect(params).toEqual(["org-1", "role-executive"]);
        return Promise.resolve({ rows: [{ id: "flow-guarded", role_id: "role-executive" }] });
      }
      expect(sql).toContain("SELECT kind, role_id, guard_operator, guard_amount_minor FROM flow_steps");
      expect(params).toEqual(["flow-guarded"]);
      return Promise.resolve({
        rows: [
          { kind: "role", role_id: "role-manager", guard_operator: "gte", guard_amount_minor: "500000" },
          { kind: "team-lead", role_id: null, guard_operator: "lt", guard_amount_minor: "10000" },
          { kind: "role", role_id: "role-finance-executive", guard_operator: null, guard_amount_minor: null },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const flow = await store.getPublishedFlowForRole("org-1", "role-executive");

    expect(flow?.steps).toEqual([
      { kind: "role", roleId: "role-manager", guard: { operator: "gte", amountMinor: 500000 } },
      { kind: "team-lead", guard: { operator: "lt", amountMinor: 10000 } },
      { kind: "role", roleId: "role-finance-executive", guard: null },
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
              status: "skipped",
              decided_at: "2026-08-04T10:00:00.000Z",
              skip_reason: "Total ₹300 under ₹5000 guard on Manager step",
            },
            {
              id: "step-2",
              claim_id: "claim-1",
              role_id: "role-finance-executive",
              assigned_actor_id: "emp-finance",
              status: "pending",
              decided_at: null,
              skip_reason: null,
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
      {
        id: "step-1",
        roleId: null,
        assignedActorId: "emp-abilash",
        status: "skipped",
        decidedAt: "2026-08-04T10:00:00.000Z",
        skipReason: "Total ₹300 under ₹5000 guard on Manager step",
      },
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

  it("writes the frozen auto-skip reason onto a skipped claim step", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = buildClaim();
    claim.status = "in-approval";
    claim.currentStage = undefined;
    claim.version = 2;
    claim.steps = [
      {
        id: "step-1",
        roleId: null,
        assignedActorId: "emp-abilash",
        status: "skipped",
        decidedAt: "2026-08-04T10:00:00.000Z",
        skipReason: "Total ₹300 under ₹5000 guard on Manager step",
      },
    ];
    await store.updateClaim(claim);

    const stepInsert = query.mock.calls.find(
      ([sql, values]) => typeof sql === "string" && sql.includes("INSERT INTO claim_approval_steps") && Array.isArray(values) && values.includes("step-1"),
    );
    expect(stepInsert?.[1]).toEqual(
      expect.arrayContaining(["skipped", "2026-08-04T10:00:00.000Z", "Total ₹300 under ₹5000 guard on Manager step"]),
    );
  });

  it("persists actor_name when inserting claim history events", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = buildClaim();
    claim.history.push({
      id: "history-2",
      kind: "auto-skipped",
      actorName: "Policy",
      detail: "Total ₹300 under ₹5000 guard on Manager step",
      createdAt: "2026-08-04T10:00:00.000Z",
    });

    await store.createClaim(claim);

    const historyInsert = query.mock.calls.find(
      ([sql, values]) =>
        typeof sql === "string" &&
        sql.includes("INSERT INTO claim_history_events") &&
        Array.isArray(values) &&
        values.includes("history-2"),
    );
    expect(historyInsert?.[0]).toContain("actor_name");
    expect(historyInsert?.[1]).toEqual(
      expect.arrayContaining(["history-2", "auto-skipped", null, "Policy", "Total ₹300 under ₹5000 guard on Manager step"]),
    );
  });

  it("maps actor_name back from claim_history_events", async () => {
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
              amount_minor: "1250000",
              expense_date: "2026-08-04",
              status: "in-approval",
              version: "1",
              created_at: "2026-08-04T10:00:00.000Z",
            },
          ],
        });
      }
      if (sql.includes("FROM claim_history_events")) {
        return Promise.resolve({
          rows: [
            {
              id: "history-1",
              claim_id: "claim-1",
              kind: "auto-skipped",
              actor_id: null,
              actor_name: "Policy",
              detail: "Total ₹300 under ₹5000 guard on Manager step",
              created_at: "2026-08-04T10:00:00.000Z",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = await store.getClaim("claim-1");

    expect(claim?.history).toEqual([
      {
        id: "history-1",
        kind: "auto-skipped",
        actorId: undefined,
        actorName: "Policy",
        detail: "Total ₹300 under ₹5000 guard on Manager step",
        createdAt: "2026-08-04T10:00:00.000Z",
      },
    ]);
  });
});

describe("PostgresExpenseStore claim lifecycle", () => {
  it("updates the editable draft columns and upserts the attachment in updateClaim", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);
    const claim = buildClaim();
    claim.attachment = {
      id: "attachment-1",
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      storageKey: "org-1/claim-1/attachment-1.pdf",
      status: "available",
      contentSha256: "abc123",
      sizeBytes: 209,
      uploadedAt: "2026-08-04T10:00:00.000Z",
    };

    await store.updateClaim(claim);

    const updateCall = query.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("UPDATE reimbursement_claims"),
    );
    expect(updateCall?.[0]).toContain("title");
    expect(updateCall?.[0]).toContain("amount_minor");
    expect(updateCall?.[0]).toContain("expense_date");
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining(["Bengaluru client flight", 1250000, "2026-08-04"]),
    );
    const attachmentCall = query.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO claim_attachments"),
    );
    expect(attachmentCall?.[1]).toEqual(
      expect.arrayContaining([
        "attachment-1",
        "claim-1",
        "receipt.pdf",
        "application/pdf",
        "org-1/claim-1/attachment-1.pdf",
        "available",
        "abc123",
        209,
      ]),
    );
  });

  it("preserves skip_reason on step conflict update when updating a claim", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);
    const claim = buildClaim();
    claim.steps = [
      {
        id: "step-1",
        roleId: "role-mgr",
        status: "skipped",
        skipReason: "Auto-skipped by threshold guard (< ₹5,000)",
      },
    ];

    await store.updateClaim(claim);

    const stepUpsertCall = query.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO claim_approval_steps"),
    );
    expect(stepUpsertCall?.[0]).toContain("skip_reason = EXCLUDED.skip_reason");
    expect(stepUpsertCall?.[1]).toEqual(
      expect.arrayContaining(["Auto-skipped by threshold guard (< ₹5,000)"]),
    );
  });

  it("writes the hold shape columns in updateClaim", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);
    const claim = buildClaim();
    claim.heldAt = "2026-08-04T10:00:00.000Z";
    claim.heldBy = "emp-ada";
    claim.heldReason = "Awaiting the missing invoice";

    await store.updateClaim(claim);

    const updateCall = query.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("UPDATE reimbursement_claims"),
    );
    expect(updateCall?.[0]).toContain("held_at");
    expect(updateCall?.[0]).toContain("held_by");
    expect(updateCall?.[0]).toContain("held_reason");
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining(["2026-08-04T10:00:00.000Z", "emp-ada", "Awaiting the missing invoice"]),
    );
  });

  it("maps the hold shape columns back into the claim", async () => {
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
              amount_minor: "1250000",
              expense_date: "2026-08-04",
              status: "in-approval",
              current_stage: "role-manager",
              current_actor_id: "emp-ada",
              version: "2",
              created_at: "2026-08-04T10:00:00.000Z",
              submitted_at: "2026-08-04T10:00:00.000Z",
              held_at: "2026-08-05T09:00:00.000Z",
              held_by: "emp-ada",
              held_reason: "Awaiting the missing invoice",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = await store.getClaim("claim-1");

    expect(claim).toMatchObject({
      heldAt: "2026-08-05T09:00:00.000Z",
      heldBy: "emp-ada",
      heldReason: "Awaiting the missing invoice",
    });
  });

  it("deletes a draft claim only when its version still matches", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    await store.deleteClaim("claim-1", 3);

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM reimbursement_claims WHERE id = $1 AND status = 'draft' AND version = $2",
      ["claim-1", 3],
    );
  });

  it("rejects deleting a claim whose status or version moved", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pool = { query } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    await expect(store.deleteClaim("claim-1", 3)).rejects.toMatchObject({
      code: "conflict",
      message: "Claim was changed by another request.",
    });
  });
});

describe("PostgresExpenseStore date normalization", () => {
  it("maps a DATE column Date object to yyyy-mm-dd without timezone drift", async () => {
    const rows = [
      {
        id: "claim-1",
        reference: "EXP-2026-0001",
        organization_id: "org-1",
        requester_id: "emp-shameel",
        title: "Bengaluru client flight",
        category: "Travel",
        sub_category: "Airfare",
        remark: "Round trip",
        amount_minor: 1250000,
        currency: "INR",
        expense_date: new Date(2026, 7, 6),
        status: "draft",
        version: 1,
        created_at: "2026-08-04T10:00:00.000Z",
      },
    ];
    const pool = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (typeof sql === "string" && sql.includes("claim_attachments")) return { rows: [] };
        if (typeof sql === "string" && sql.includes("claim_approval_steps")) return { rows: [] };
        if (typeof sql === "string" && sql.includes("claim_history_events")) return { rows: [] };
        return { rows };
      }),
    } as unknown as Pool;
    const store = new PostgresExpenseStore(pool);

    const claim = await store.getClaim("claim-1");

    expect(claim?.expenseDate).toBe("2026-08-06");
  });
});
