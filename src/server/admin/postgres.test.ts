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
    expect(stepInserts[0]?.[1]).toEqual([expect.any(String), 0, "team-lead", null, null, null]);
    expect(stepInserts[1]?.[1]).toEqual([
      expect.any(String),
      1,
      "role",
      "role-manager",
      null,
      null,
    ]);
    const sql = String(stepInserts[0]?.[0]);
    expect(sql).toContain("(flow_id, position, kind, role_id, guard_operator, guard_amount_minor)");
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
        steps: [
          { kind: "team-lead", guard: null },
          { kind: "role", roleId: "role-manager", guard: null },
        ],
      },
    ]);
  });

  it("createFlow persists guard operator and amount for guarded steps and nulls for unguarded ones", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.createFlow("org-1", {
      name: "Guarded reimbursement",
      roleId: "role-intern",
      steps: [
        { kind: "role", roleId: "role-manager", guard: { operator: "gte", amountMinor: 500000 } },
        { kind: "team-lead", guard: { operator: "lt", amountMinor: 10000 } },
        { kind: "role", roleId: "role-finance-executive" },
      ],
    });

    const stepInserts = query.mock.calls.filter(
      ([sql, values]) =>
        typeof sql === "string" && sql.includes("INSERT INTO flow_steps") && Array.isArray(values),
    );
    expect(stepInserts).toHaveLength(3);
    expect(stepInserts[0]?.[1]).toEqual([
      expect.any(String),
      0,
      "role",
      "role-manager",
      "gte",
      500000,
    ]);
    expect(stepInserts[1]?.[1]).toEqual([expect.any(String), 1, "team-lead", null, "lt", 10000]);
    expect(stepInserts[2]?.[1]).toEqual([
      expect.any(String),
      2,
      "role",
      "role-finance-executive",
      null,
      null,
    ]);
    const sql = String(stepInserts[0]?.[0]);
    expect(sql).toContain("guard_operator, guard_amount_minor");
  });

  it("updateFlow rewrites steps including their guard columns", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.trimStart().startsWith("SELECT id, organization_id, name, role_id, status")) {
        return Promise.resolve({
          rows: [
            {
              id: "flow-1",
              organization_id: "org-1",
              name: "Guarded reimbursement",
              role_id: "role-intern",
              status: "draft",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.updateFlow("flow-1", {
      name: "Guarded reimbursement",
      roleId: "role-intern",
      steps: [
        { kind: "role", roleId: "role-manager", guard: { operator: "lte", amountMinor: 75000 } },
      ],
    });

    const stepInserts = query.mock.calls.filter(
      ([sql, values]) =>
        typeof sql === "string" && sql.includes("INSERT INTO flow_steps") && Array.isArray(values),
    );
    expect(stepInserts).toHaveLength(1);
    expect(stepInserts[0]?.[1]).toEqual([
      expect.any(String),
      0,
      "role",
      "role-manager",
      "lte",
      75000,
    ]);
  });

  it("listFlows maps amount guards back from flow_steps rows", async () => {
    const poolQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.trimStart().startsWith("SELECT id, organization_id, name, role_id, status")) {
        return Promise.resolve({
          rows: [
            {
              id: "flow-1",
              organization_id: "org-1",
              name: "Guarded reimbursement",
              role_id: "role-intern",
              status: "draft",
              created_at: "2026-08-04T10:00:00.000Z",
              updated_at: "2026-08-04T10:00:00.000Z",
            },
          ],
        });
      }
      return Promise.resolve({
        rows: [
          {
            flow_id: "flow-1",
            kind: "role",
            role_id: "role-manager",
            guard_operator: "gte",
            guard_amount_minor: "500000",
          },
          {
            flow_id: "flow-1",
            kind: "team-lead",
            role_id: null,
            guard_operator: null,
            guard_amount_minor: null,
          },
        ],
      });
    });
    const pool = { query: poolQuery } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const flows = await store.listFlows("org-1");

    expect(flows).toEqual([
      {
        id: "flow-1",
        name: "Guarded reimbursement",
        roleId: "role-intern",
        status: "draft",
        steps: [
          { kind: "role", roleId: "role-manager", guard: { operator: "gte", amountMinor: 500000 } },
          { kind: "team-lead", guard: null },
        ],
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

  it("listDepartments joins the head employee for name and id", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "dept-1",
          organization_id: "org-1",
          name: "Engineering",
          active: true,
          head_id: "emp-2",
          head_name: "Ada Lovelace",
        },
        {
          id: "dept-2",
          organization_id: "org-1",
          name: "Legacy",
          active: true,
          head_id: null,
          head_name: null,
        },
      ],
    });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const departments = await store.listDepartments("org-1");

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("LEFT JOIN employees h ON h.id = d.head_id");
    expect(sql).toContain("d.head_id");
    expect(sql).toContain("h.name AS head_name");
    expect(departments).toEqual([
      {
        id: "dept-1",
        organizationId: "org-1",
        name: "Engineering",
        active: true,
        headId: "emp-2",
        head: { id: "emp-2", name: "Ada Lovelace" },
      },
      {
        id: "dept-2",
        organizationId: "org-1",
        name: "Legacy",
        active: true,
        headId: null,
        head: null,
      },
    ]);
  });

  it("createDepartment inserts the head id and maps the head back", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "emp-2", name: "Ada Lovelace" }] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const department = await store.createDepartment("org-1", {
      name: "Engineering",
      headId: "emp-2",
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      "INSERT INTO departments (id, organization_id, name, head_id) VALUES ($1, $2, $3, $4)",
      [expect.any(String), "org-1", "Engineering", "emp-2"],
    );
    expect(department).toMatchObject({
      name: "Engineering",
      active: true,
      headId: "emp-2",
      head: { id: "emp-2", name: "Ada Lovelace" },
    });
  });

  it("createDepartment maps a duplicate name to a validation error", async () => {
    const query = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error("duplicate department"), {
        code: "23505",
        constraint: "idx_departments_org_name",
      }),
    );
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await expect(
      store.createDepartment("org-1", { name: "Engineering", headId: "emp-2" }),
    ).rejects.toMatchObject({
      code: "validation",
      message: 'A department named "Engineering" already exists.',
    });
  });

  it("setDepartmentHead updates departments.head_id", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.setDepartmentHead("dept-1", "emp-2");

    expect(query).toHaveBeenCalledWith("UPDATE departments SET head_id = $1 WHERE id = $2", [
      "emp-2",
      "dept-1",
    ]);
  });

  it("findEmployeeByEmail selects the org-scoped employee", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "emp-1",
          organization_id: "org-1",
          name: "Ada Lovelace",
          email: "ada@hive.local",
          active: true,
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

    const employee = await store.findEmployeeByEmail("org-1", "ada@hive.local");

    expect(query).toHaveBeenCalledWith(expect.any(String), ["org-1", "ada@hive.local"]);
    expect(employee).toMatchObject({ id: "emp-1", email: "ada@hive.local" });
  });

  it("findEmployeeByEmail returns null when nothing matches", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await expect(store.findEmployeeByEmail("org-1", "nobody@hive.local")).resolves.toBeNull();
  });

  it("createEmployees writes every row inside one transaction", async () => {
    const query = vi
      .fn()
      .mockImplementation((sql: string) =>
        typeof sql === "string" && sql.includes("INSERT INTO employees")
          ? Promise.resolve({
              rows: [
                {
                  id: "emp-a",
                  organization_id: "org-1",
                  name: "Ada Lovelace",
                  email: "ada@hive.local",
                  active: true,
                },
              ],
            })
          : Promise.resolve({ rows: [] }),
      );
    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const created = await store.createEmployees("org-1", [
      {
        id: "emp-a",
        name: "Ada Lovelace",
        email: "ada@hive.local",
        roleId: "role-1",
        departmentId: "dept-1",
        managerId: "emp-2",
      },
      {
        id: "emp-b",
        name: "Grace Hopper",
        email: "grace@hive.local",
        roleId: null,
        departmentId: null,
        managerId: null,
      },
    ]);

    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    const employeeInserts = query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO employees"),
    );
    expect(employeeInserts).toHaveLength(2);
    expect(employeeInserts[0]?.[1]).toEqual([
      "emp-a",
      "org-1",
      "Ada Lovelace",
      "ada@hive.local",
      "dept-1",
    ]);
    expect(employeeInserts[1]?.[1]).toEqual([
      "emp-b",
      "org-1",
      "Grace Hopper",
      "grace@hive.local",
      null,
    ]);
    const roleInserts = query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO employee_roles"),
    );
    expect(roleInserts).toHaveLength(1);
    expect(roleInserts[0]?.[1]).toEqual(["emp-a", "role-1"]);
    const hierarchyInserts = query.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO hierarchy_assignments"),
    );
    expect(hierarchyInserts).toHaveLength(1);
    expect(hierarchyInserts[0]?.[1]).toEqual(["emp-a", "emp-2"]);
    expect(query.mock.calls[query.mock.calls.length - 1]).toEqual(["COMMIT"]);
    expect(release).toHaveBeenCalledOnce();
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ id: "emp-a", email: "ada@hive.local" });
  });

  it("createEmployees rolls back the whole batch on a duplicate email", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate email"), {
          code: "23505",
          constraint: "employees_email_key",
        }),
      );
    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const promise = store.createEmployees("org-1", [
      {
        id: "emp-a",
        name: "Ada Lovelace",
        email: "ada@hive.local",
        roleId: null,
        departmentId: null,
        managerId: null,
      },
      {
        id: "emp-b",
        name: "Grace Hopper",
        email: "grace@hive.local",
        roleId: null,
        departmentId: null,
        managerId: null,
      },
    ]);

    await expect(promise).rejects.toMatchObject({
      code: "validation",
      message: "One of the imported email addresses already exists.",
    });
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("organization settings", () => {
  it("resolves the 3-day default for an organization without a settings row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await expect(store.getAbsenceTimeoutDays("org-1")).resolves.toBe(3);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT absence_timeout_days FROM organization_settings"),
      ["org-1"],
    );
  });

  it("reads back a stored timeout", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ absence_timeout_days: 10 }] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await expect(store.getAbsenceTimeoutDays("org-1")).resolves.toBe(10);
  });

  it("upserts a timeout row so a second write updates in place", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.setAbsenceTimeoutDays("org-1", 7);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("INSERT INTO organization_settings");
    expect(sql).toContain("ON CONFLICT (organization_id) DO UPDATE");
    expect(query).toHaveBeenCalledWith(expect.any(String), ["org-1", 7]);
  });

  it("lists every organization id in order", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "org-2" }, { id: "org-1" }] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await expect(store.listOrganizations()).resolves.toEqual(["org-2", "org-1"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT id FROM organizations"));
  });
});

describe("role capabilities", () => {
  const roleRow = (overrides: Record<string, unknown> = {}) => ({
    id: "role-1",
    organization_id: "org-1",
    code: "manager",
    display_name: "Manager",
    department_id: null,
    active: true,
    locked: true,
    can_submit: true,
    can_approve: true,
    can_access_finance: false,
    can_hold: false,
    can_view_org_activity: false,
    can_access_admin_console: false,
    ...overrides,
  });

  it("maps the six capability columns on role rows", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [roleRow()] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const roles = await store.listRoles("org-1");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("can_submit, can_approve, can_access_finance"),
      ["org-1"],
    );
    expect(roles).toEqual([
      {
        id: "role-1",
        organizationId: "org-1",
        code: "manager",
        displayName: "Manager",
        departmentId: null,
        active: true,
        locked: true,
        capabilities: {
          canSubmit: true,
          canApprove: true,
          canAccessFinance: false,
          canHold: false,
          canViewOrganizationActivity: false,
          canAccessAdminConsole: false,
        },
      },
    ]);
  });

  it("getRole maps the capability columns too", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [roleRow({ can_hold: true, can_access_admin_console: true })] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const role = await store.getRole("role-1");

    expect(role?.capabilities).toMatchObject({ canHold: true, canAccessAdminConsole: true });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM roles WHERE id = $1"), [
      "role-1",
    ]);
  });

  it("createRole inserts the capability columns, defaulting to submit-only when absent", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    const role = await store.createRole("org-1", {
      code: "reviewer",
      displayName: "Reviewer",
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("can_submit, can_approve, can_access_finance, can_hold");
    expect(sql).toContain("VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9, $10)");
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      expect.any(String),
      "org-1",
      "reviewer",
      "Reviewer",
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(role.capabilities).toEqual({
      canSubmit: true,
      canApprove: false,
      canAccessFinance: false,
      canHold: false,
      canViewOrganizationActivity: false,
      canAccessAdminConsole: false,
    });
  });

  it("createRole persists an explicit capability set", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.createRole("org-1", {
      code: "reviewer",
      displayName: "Reviewer",
      capabilities: {
        canSubmit: true,
        canApprove: true,
        canAccessFinance: false,
        canHold: true,
        canViewOrganizationActivity: false,
        canAccessAdminConsole: false,
      },
    });

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      expect.any(String),
      "org-1",
      "reviewer",
      "Reviewer",
      true,
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  it("setRoleCapabilities updates all six toggle columns", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const store = new PostgresAdminStore(pool);

    await store.setRoleCapabilities("role-1", {
      canSubmit: true,
      canApprove: false,
      canAccessFinance: true,
      canHold: false,
      canViewOrganizationActivity: true,
      canAccessAdminConsole: false,
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("UPDATE roles SET");
    expect(sql).toContain("can_submit = $2");
    expect(sql).toContain("can_access_admin_console = $7");
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      "role-1",
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});
