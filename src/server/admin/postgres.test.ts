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
          constraint: "idx_flows_org_name_role_draft",
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
      roleId: "role-1",
      steps: [{ kind: "role", roleId: "role-1" }],
    });

    await expect(promise).rejects.toBeInstanceOf(AdminError);
    await expect(promise).rejects.toMatchObject({
      code: "validation",
      message:
        'A draft flow named "Standard reimbursement" for this role already exists.',
    });
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("listEmployees selects the active flag and manager id via hierarchy_assignments", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "emp-1",
          organization_id: "org-1",
          name: "Ada Lovelace",
          email: "ada@hive.local",
          active: true,
          department_id: "dept-1",
          department_name: "Engineering",
          role_id: "role-1",
          role_code: "executive",
          role_name: "Executive",
          manager_id: "emp-2",
        },
      ],
    });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const people = await store.listEmployees("org-1");

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("e.active");
    expect(sql).toContain("LEFT JOIN hierarchy_assignments ha ON ha.employee_id = e.id");
    expect(sql).toContain("ha.manager_id");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["org-1"]);
    expect(people).toEqual([
      {
        id: "emp-1",
        organizationId: "org-1",
        name: "Ada Lovelace",
        email: "ada@hive.local",
        department: "Engineering",
        departmentId: "dept-1",
        role: { id: "role-1", code: "executive", displayName: "Executive" },
        active: true,
        managerId: "emp-2",
      },
    ]);
  });

  it("getEmployee maps a missing manager to null and a missing active flag to false", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "emp-1",
          organization_id: "org-1",
          name: "Ada Lovelace",
          email: "ada@hive.local",
          active: false,
          department_id: null,
          department_name: null,
          role_id: null,
          role_code: null,
          role_name: null,
          manager_id: null,
        },
      ],
    });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const person = await store.getEmployee("emp-1");

    expect(person).toMatchObject({
      id: "emp-1",
      active: false,
      managerId: null,
      departmentId: null,
      role: null,
    });
    expect(query).toHaveBeenCalledWith(expect.any(String), ["emp-1"]);
  });

  it("setEmployeeActive issues an UPDATE on employees.active", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.setEmployeeActive("emp-1", false);

    expect(query).toHaveBeenCalledWith("UPDATE employees SET active = $2 WHERE id = $1", [
      "emp-1",
      false,
    ]);
  });

  it("createEmployee inserts a bare active row with no department and maps it back", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "emp-1",
          organization_id: "org-1",
          name: "John Doe",
          email: "john.doe@hive.local",
          active: true,
        },
      ],
    });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const employee = await store.createEmployee("org-1", {
      id: "emp-1",
      name: "John Doe",
      email: "john.doe@hive.local",
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("INSERT INTO employees");
    expect(sql).toContain("(id, organization_id, name, email, department_id)");
    expect(sql).toContain("NULL");
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "emp-1",
      "org-1",
      "John Doe",
      "john.doe@hive.local",
    ]);
    expect(employee).toEqual({
      id: "emp-1",
      organizationId: "org-1",
      name: "John Doe",
      email: "john.doe@hive.local",
      department: "",
      departmentId: null,
      role: null,
      active: true,
      managerId: null,
    });
  });

  it("setEmployeeManager upserts hierarchy_assignments when a manager is given", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.setEmployeeManager("emp-1", "emp-2");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO hierarchy_assignments (employee_id, manager_id)"),
      ["emp-1", "emp-2"],
    );
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("ON CONFLICT (employee_id) DO UPDATE");
    expect(sql).toContain("updated_at = now()");
  });

  it("setEmployeeManager deletes the hierarchy_assignments row when the manager is cleared", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.setEmployeeManager("emp-1", null);

    expect(query).toHaveBeenCalledWith("DELETE FROM hierarchy_assignments WHERE employee_id = $1", [
      "emp-1",
    ]);
  });

  it("createFlow inserts flow steps with their target kind and a null role id for team-lead steps", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.createFlow("org-1", {
      name: "Intern reimbursement",
      roleId: "role-intern",
      steps: [{ kind: "team-lead" }, { kind: "role", roleId: "role-manager" }],
    });

    const stepInserts = query.mock.calls.filter(
      ([sql, values]) =>
        typeof sql === "string" && sql.includes("INSERT INTO flow_steps") && Array.isArray(values),
    );
    expect(stepInserts).toHaveLength(2);
    expect(stepInserts[0]?.[1]).toEqual([expect.any(String), 0, "team-lead", null]);
    expect(stepInserts[1]?.[1]).toEqual([expect.any(String), 1, "role", "role-manager"]);
    const sql = String(stepInserts[0]?.[0]);
    expect(sql).toContain("(flow_id, position, kind, role_id)");
  });

  it("listFlows maps flow steps back to role and team-lead targets", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.trimStart().startsWith("SELECT id, organization_id, name, role_id, status")) {
        return Promise.resolve({
          rows: [{ id: "flow-1", organization_id: "org-1", name: "Intern reimbursement", role_id: "role-intern", status: "published", created_at: "2026-08-04T10:00:00.000Z", updated_at: "2026-08-04T10:00:00.000Z" }],
        });
      }
      return Promise.resolve({
        rows: [
          { flow_id: "flow-1", kind: "team-lead", role_id: null },
          { flow_id: "flow-1", kind: "role", role_id: "role-manager" },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const flows = await store.listFlows("org-1");

    expect(flows).toEqual([
      {
        id: "flow-1",
        name: "Intern reimbursement",
        roleId: "role-intern",
        status: "published",
        steps: [{ kind: "team-lead" }, { kind: "role", roleId: "role-manager" }],
      },
    ]);
  });

  it("listAuditEvents filters, orders, and paginates with parameterized SQL plus a count query", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      if (String(sql).includes("count(*)")) {
        return Promise.resolve({ rows: [{ count: "12" }] });
      }
      return Promise.resolve({
        rows: [
          {
            id: "audit-1",
            organization_id: "org-1",
            actor_id: "emp-1",
            action: "assign-role",
            detail: "Ada Lovelace assigned to the Executive role.",
            created_at: "2026-08-05T09:00:00.000Z",
          },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const result = await store.listAuditEvents(
      "org-1",
      { actorId: "emp-1", action: "assign-role", from: "2026-08-01", to: "2026-08-10" },
      { page: 2, pageSize: 10 },
    );

    expect(poolQuery).toHaveBeenCalledTimes(2);
    const selectSql = String(poolQuery.mock.calls[0]?.[0]);
    expect(selectSql).toContain("FROM audit_events");
    expect(selectSql).toContain(
      "WHERE organization_id = $1 AND actor_id = $2 AND action = $3 AND created_at >= $4 AND created_at < $5",
    );
    expect(selectSql).toContain("ORDER BY created_at DESC, id DESC");
    expect(selectSql).toContain("LIMIT $6 OFFSET $7");
    expect(poolQuery.mock.calls[0]?.[1]).toEqual([
      "org-1",
      "emp-1",
      "assign-role",
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-11T00:00:00.000Z"),
      10,
      10,
    ]);
    const countSql = String(poolQuery.mock.calls[1]?.[0]);
    expect(countSql).toContain("SELECT count(*)");
    expect(countSql).toContain(
      "WHERE organization_id = $1 AND actor_id = $2 AND action = $3 AND created_at >= $4 AND created_at < $5",
    );
    expect(poolQuery.mock.calls[1]?.[1]).toEqual([
      "org-1",
      "emp-1",
      "assign-role",
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-11T00:00:00.000Z"),
    ]);
    expect(result).toEqual({
      events: [
        {
          id: "audit-1",
          organizationId: "org-1",
          actorId: "emp-1",
          action: "assign-role",
          detail: "Ada Lovelace assigned to the Executive role.",
          createdAt: new Date("2026-08-05T09:00:00.000Z"),
        },
      ],
      total: 12,
    });
  });

  it("listAuditEvents without filters scopes only to the organization", async () => {
    const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const result = await store.listAuditEvents("org-1", {}, { page: 1, pageSize: 50 });

    expect(poolQuery).toHaveBeenCalledTimes(2);
    const selectSql = String(poolQuery.mock.calls[0]?.[0]);
    expect(selectSql).toContain("WHERE organization_id = $1");
    expect(selectSql).not.toMatch(/actor_id = \$/);
    expect(selectSql).not.toMatch(/action = \$/);
    expect(selectSql).not.toMatch(/created_at >= \$/);
    expect(selectSql).not.toMatch(/created_at < \$/);
    expect(selectSql).toContain("LIMIT $2 OFFSET $3");
    expect(poolQuery.mock.calls[0]?.[1]).toEqual(["org-1", 50, 0]);
    expect(result).toEqual({ events: [], total: 0 });
  });
});
