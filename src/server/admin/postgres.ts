import { Pool } from "pg";
import { AdminError } from "./commands";
import { auditRangeBounds } from "./audit-filter";
import { guardFromRow } from "../shared/amount-guard";
import { DEFAULT_ABSENCE_TIMEOUT_DAYS } from "../shared/absence-timeout";
import { SUBMIT_ONLY_CAPABILITIES, type RoleCapabilities } from "../shared/authorization";
import type {
  AdminDepartment,
  AdminEmployee,
  AdminRole,
  AdminStore,
  AuditEvent,
  AuditFilter,
  DepartmentInput,
  FlowDraft,
  FlowInput,
  FlowStatus,
  FlowStepInput,
  RoleInput,
} from "./ports";

type Row = Record<string, unknown>;

// A flow_steps row maps back to its target kind: team-lead steps carry a
// null role id, role steps always reference a role. The guard columns are
// either both null (unguarded) or a full operator/amount pair - the
// flow_steps_guard_check constraint guarantees the pair stays coherent.
function flowStepFromRow(row: Row): FlowStepInput {
  const guard = guardFromRow(row);
  return row.kind === "team-lead"
    ? { kind: "team-lead", guard }
    : { kind: "role", roleId: String(row.role_id), guard };
}

// employee_roles remains many-to-many in the schema (ADR-0002 forward
// compatibility note), but this module treats an employee as having one
// role: the join picks a single, deterministic row per employee instead of
// letting a legacy multi-role assignment fan out into duplicate employee
// rows or an arbitrarily-ordered pick.
const employeeRoleJoin = `
  LEFT JOIN LATERAL (
    SELECT role_id FROM employee_roles WHERE employee_id = e.id ORDER BY role_id LIMIT 1
  ) er ON true
  LEFT JOIN roles r ON r.id = er.role_id
`;

// The six role capability columns (ADR-0015) as a role record's privilege
// set. Reads the row's aliased capability fields (role_can_* for employee
// joins, can_* for role rows). Legacy mock rows without the columns yield
// undefined, which resolution treats as the submit-only default; real
// roles rows always carry them after migration 0025.
function roleCapabilitiesFromRow(row: Row): RoleCapabilities | undefined {
  if (row.can_submit === null || row.can_submit === undefined) return undefined;
  return {
    canSubmit: Boolean(row.can_submit),
    canApprove: Boolean(row.can_approve),
    canAccessFinance: Boolean(row.can_access_finance),
    canHold: Boolean(row.can_hold),
    canViewOrganizationActivity: Boolean(row.can_view_org_activity),
    canAccessAdminConsole: Boolean(row.can_access_admin_console),
  };
}

// The employee join aliases the six capability columns under role_* so the
// same helper reads them via the role_* keys.
function roleCapabilitiesFromEmployeeRow(row: Row): RoleCapabilities | undefined {
  const caps = roleCapabilitiesFromRow({
    can_submit: row.role_can_submit,
    can_approve: row.role_can_approve,
    can_access_finance: row.role_can_access_finance,
    can_hold: row.role_can_hold,
    can_view_org_activity: row.role_can_view_org_activity,
    can_access_admin_console: row.role_can_access_admin_console,
  });
  return caps;
}

const roleCapabilityColumns = `
  r.can_submit AS role_can_submit, r.can_approve AS role_can_approve,
  r.can_access_finance AS role_can_access_finance, r.can_hold AS role_can_hold,
  r.can_view_org_activity AS role_can_view_org_activity,
  r.can_access_admin_console AS role_can_access_admin_console
`;

const employeeSelect = `
  SELECT e.id, e.organization_id, e.name, e.email, e.active, e.department_id,
    d.name AS department_name,
    r.id AS role_id, r.code AS role_code, r.display_name AS role_name,
    ${roleCapabilityColumns},
    ha.manager_id
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  ${employeeRoleJoin}
  LEFT JOIN hierarchy_assignments ha ON ha.employee_id = e.id
`;

function roleRefFromRow(row: Row): AdminEmployee["role"] {
  if (row.role_id === null || row.role_id === undefined) {
    return null;
  }
  const capabilities = roleCapabilitiesFromEmployeeRow(row);
  return {
    id: String(row.role_id),
    code: String(row.role_code),
    displayName: String(row.role_name),
    ...(capabilities ? { capabilities } : {}),
  };
}

function employeeFromRow(row: Row): AdminEmployee {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    email: String(row.email),
    department: row.department_name === null || row.department_name === undefined
      ? ""
      : String(row.department_name),
    departmentId: row.department_id === null || row.department_id === undefined
      ? null
      : String(row.department_id),
    role: roleRefFromRow(row),
    active: Boolean(row.active),
    managerId: row.manager_id === null || row.manager_id === undefined
      ? null
      : String(row.manager_id),
  };
}

const roleSelectColumns = `
  id, organization_id, code, display_name, department_id, active, locked,
  can_submit, can_approve, can_access_finance, can_hold,
  can_view_org_activity, can_access_admin_console
`;

function roleFromRow(row: Row): AdminRole {
  const capabilities = roleCapabilitiesFromRow(row);
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    displayName: String(row.display_name),
    departmentId: row.department_id === null ? null : String(row.department_id),
    active: Boolean(row.active),
    locked: Boolean(row.locked),
    ...(capabilities ? { capabilities } : {}),
  };
}

function departmentFromRow(row: Row): AdminDepartment {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    active: Boolean(row.active),
    headId: row.head_id === null || row.head_id === undefined ? null : String(row.head_id),
    head:
      row.head_id === null || row.head_id === undefined
        ? null
        : { id: String(row.head_id), name: String(row.head_name) },
  };
}

function flowStatusFromRow(row: Row): FlowStatus {
  return row.status === "published" ? "published" : row.status === "archived" ? "archived" : "draft";
}

function auditEventFromRow(row: Row): AuditEvent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    actorId: String(row.actor_id),
    action: String(row.action),
    detail: String(row.detail),
    createdAt: new Date(String(row.created_at)),
  };
}

export class PostgresAdminStore implements AdminStore {
  constructor(private readonly pool: Pool) {}

  async listEmployees(organizationId: string): Promise<AdminEmployee[]> {
    const result = await this.pool.query<Row>(
      `
        ${employeeSelect}
        WHERE e.organization_id = $1
        ORDER BY e.name
      `,
      [organizationId],
    );
    return result.rows.map(employeeFromRow);
  }

  async getEmployee(id: string): Promise<AdminEmployee | null> {
    const result = await this.pool.query<Row>(
      `
        ${employeeSelect}
        WHERE e.id = $1
      `,
      [id],
    );
    return result.rows.length > 0 ? employeeFromRow(result.rows[0]) : null;
  }

  async findEmployeeByEmail(
    organizationId: string,
    email: string,
  ): Promise<AdminEmployee | null> {
    const result = await this.pool.query<Row>(
      `
        ${employeeSelect}
        WHERE e.organization_id = $1 AND e.email = $2
        LIMIT 1
      `,
      [organizationId, email],
    );
    return result.rows.length > 0 ? employeeFromRow(result.rows[0]) : null;
  }

  // First-login provisioning creates a bare employee record: no department,
  // no manager, active by default. The role is assigned right after via
  // setEmployeeRole; the console assigns department and manager later.
  async createEmployee(
    organizationId: string,
    input: { id: string; name: string; email: string },
  ): Promise<AdminEmployee> {
    const result = await this.pool.query<Row>(
      `INSERT INTO employees (id, organization_id, name, email, department_id)
       VALUES ($1, $2, $3, $4, NULL)
       RETURNING id, organization_id, name, email, active`,
      [input.id, organizationId, input.name, input.email],
    );
    const row = result.rows[0];
    return {
      id: String(row.id),
      organizationId: String(row.organization_id),
      name: String(row.name),
      email: String(row.email),
      department: "",
      departmentId: null,
      role: null,
      active: true,
      managerId: null,
    };
  }

  // This slice models one administration role per employee (ADR 0002), so
  // assignment replaces any previously assigned role instead of adding one.
  async setEmployeeRole(employeeId: string, roleId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM employee_roles WHERE employee_id = $1", [employeeId]);
      await client.query(
        "INSERT INTO employee_roles (employee_id, role_id) VALUES ($1, $2)",
        [employeeId, roleId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async setEmployeeDepartment(employeeId: string, departmentId: string): Promise<void> {
    await this.pool.query(
      "UPDATE employees SET department_id = $1 WHERE id = $2",
      [departmentId, employeeId],
    );
  }

  async setEmployeeActive(employeeId: string, active: boolean): Promise<void> {
    await this.pool.query("UPDATE employees SET active = $2 WHERE id = $1", [employeeId, active]);
  }

  async setEmployeeManager(employeeId: string, managerId: string | null): Promise<void> {
    if (managerId === null) {
      await this.pool.query("DELETE FROM hierarchy_assignments WHERE employee_id = $1", [
        employeeId,
      ]);
      return;
    }
    await this.pool.query(
      `INSERT INTO hierarchy_assignments (employee_id, manager_id) VALUES ($1, $2)
       ON CONFLICT (employee_id) DO UPDATE SET manager_id = $2, updated_at = now()`,
      [employeeId, managerId],
    );
  }

  async listDepartments(organizationId: string): Promise<AdminDepartment[]> {
    const result = await this.pool.query<Row>(
      `SELECT d.id, d.organization_id, d.name, d.active, d.head_id,
              h.name AS head_name
       FROM departments d
       LEFT JOIN employees h ON h.id = d.head_id
       WHERE d.organization_id = $1
       ORDER BY d.name`,
      [organizationId],
    );
    return result.rows.map(departmentFromRow);
  }

  async createDepartment(
    organizationId: string,
    input: DepartmentInput,
  ): Promise<AdminDepartment> {
    const id = `dept-${crypto.randomUUID()}`;
    try {
      await this.pool.query(
        "INSERT INTO departments (id, organization_id, name, head_id) VALUES ($1, $2, $3, $4)",
        [id, organizationId, input.name, input.headId],
      );
    } catch (error) {
      if (isUniqueViolation(error, "idx_departments_org_name")) {
        throw new AdminError("validation", `A department named "${input.name}" already exists.`);
      }
      throw error;
    }
    const headResult = await this.pool.query<Row>(
      "SELECT id, name FROM employees WHERE id = $1",
      [input.headId],
    );
    const head = headResult.rows[0];
    return {
      id,
      organizationId,
      name: input.name,
      active: true,
      headId: input.headId,
      head: head ? { id: String(head.id), name: String(head.name) } : null,
    };
  }

  async setDepartmentHead(departmentId: string, headId: string): Promise<void> {
    await this.pool.query("UPDATE departments SET head_id = $1 WHERE id = $2", [
      headId,
      departmentId,
    ]);
  }

  // Bulk employee creation is one transaction: any failing row (the only
  // realistic failure is the employees.email unique violation) rolls the
  // whole import back, so a roster never lands partially.
  async createEmployees(
    organizationId: string,
    inputs: Array<{
      id: string;
      name: string;
      email: string;
      roleId?: string | null;
      departmentId?: string | null;
      managerId?: string | null;
    }>,
  ): Promise<AdminEmployee[]> {
    const client = await this.pool.connect();
    const created: AdminEmployee[] = [];
    try {
      await client.query("BEGIN");
      for (const input of inputs) {
        const result = await client.query<Row>(
          `INSERT INTO employees (id, organization_id, name, email, department_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, organization_id, name, email, active`,
          [input.id, organizationId, input.name, input.email, input.departmentId ?? null],
        );
        created.push(employeeFromRow(result.rows[0] ?? {}));
        if (input.roleId) {
          await client.query(
            "INSERT INTO employee_roles (employee_id, role_id) VALUES ($1, $2)",
            [input.id, input.roleId],
          );
        }
        if (input.managerId) {
          await client.query(
            `INSERT INTO hierarchy_assignments (employee_id, manager_id) VALUES ($1, $2)
             ON CONFLICT (employee_id) DO UPDATE SET manager_id = $2, updated_at = now()`,
            [input.id, input.managerId],
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error, "employees_email_key")) {
        throw new AdminError("validation", "One of the imported email addresses already exists.");
      }
      throw error;
    } finally {
      client.release();
    }
    return created;
  }

  async deactivateDepartment(departmentId: string): Promise<void> {
    await this.pool.query("UPDATE departments SET active = false WHERE id = $1", [departmentId]);
  }

  async listRoles(organizationId: string): Promise<AdminRole[]> {
    const result = await this.pool.query<Row>(
      `SELECT ${roleSelectColumns} FROM roles WHERE organization_id = $1 ORDER BY display_name`,
      [organizationId],
    );
    return result.rows.map(roleFromRow);
  }

  async getRole(roleId: string): Promise<AdminRole | null> {
    const result = await this.pool.query<Row>(
      `SELECT ${roleSelectColumns} FROM roles WHERE id = $1`,
      [roleId],
    );
    return result.rows.length > 0 ? roleFromRow(result.rows[0]) : null;
  }

  async createRole(organizationId: string, input: RoleInput): Promise<AdminRole> {
    const id = `role-${crypto.randomUUID()}`;
    const capabilities = input.capabilities ?? SUBMIT_ONLY_CAPABILITIES;
    try {
      await this.pool.query(
        `INSERT INTO roles
           (id, organization_id, code, display_name, locked,
            can_submit, can_approve, can_access_finance, can_hold,
            can_view_org_activity, can_access_admin_console)
         VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          organizationId,
          input.code,
          input.displayName,
          capabilities.canSubmit,
          capabilities.canApprove,
          capabilities.canAccessFinance,
          capabilities.canHold,
          capabilities.canViewOrganizationActivity,
          capabilities.canAccessAdminConsole,
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error, "idx_roles_org_code")) {
        throw new AdminError("validation", `A role with code "${input.code}" already exists.`);
      }
      throw error;
    }
    return {
      id,
      organizationId,
      code: input.code,
      displayName: input.displayName,
      departmentId: null,
      active: true,
      locked: false,
      capabilities,
    };
  }

  async setRoleCapabilities(roleId: string, capabilities: RoleCapabilities): Promise<void> {
    await this.pool.query(
      `UPDATE roles SET
         can_submit = $2, can_approve = $3, can_access_finance = $4, can_hold = $5,
         can_view_org_activity = $6, can_access_admin_console = $7
       WHERE id = $1`,
      [
        roleId,
        capabilities.canSubmit,
        capabilities.canApprove,
        capabilities.canAccessFinance,
        capabilities.canHold,
        capabilities.canViewOrganizationActivity,
        capabilities.canAccessAdminConsole,
      ],
    );
  }

  async deactivateRole(roleId: string): Promise<void> {
    await this.pool.query("UPDATE roles SET active = false WHERE id = $1", [roleId]);
  }

  async createFlow(organizationId: string, input: FlowInput): Promise<FlowDraft> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const flowId = `flow-${crypto.randomUUID()}`;
      await client.query(
        `INSERT INTO flows (id, organization_id, name, role_id, status)
         VALUES ($1, $2, $3, $4, 'draft')`,
        [flowId, organizationId, input.name, input.roleId],
      );
      for (let index = 0; index < input.steps.length; index += 1) {
        const step = input.steps[index];
        await client.query(
          `INSERT INTO flow_steps
             (flow_id, position, kind, role_id, guard_operator, guard_amount_minor)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            flowId,
            index,
            step.kind,
            step.kind === "role" ? step.roleId : null,
            step.guard?.operator ?? null,
            step.guard?.amountMinor ?? null,
          ],
        );
      }
      await client.query("COMMIT");
      return {
        id: flowId,
        name: input.name,
        roleId: input.roleId,
        status: "draft",
        steps: [...input.steps],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error, "idx_flows_org_name_role_draft")) {
        throw new AdminError(
          "validation",
          `A draft flow named "${input.name}" for this role already exists.`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateFlow(flowId: string, input: FlowInput): Promise<FlowDraft> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const flowResult = await client.query<Row>(
        "SELECT id, organization_id, name, role_id, status FROM flows WHERE id = $1",
        [flowId],
      );
      if (flowResult.rows.length === 0) {
        throw new AdminError("not-found", "Flow does not exist.");
      }
      const existingStatus = String(flowResult.rows[0].status) as FlowStatus;
      await client.query(
        "UPDATE flows SET name = $1, role_id = $2, updated_at = now() WHERE id = $3",
        [input.name, input.roleId, flowId],
      );
      await client.query("DELETE FROM flow_steps WHERE flow_id = $1", [flowId]);
      for (let index = 0; index < input.steps.length; index += 1) {
        const step = input.steps[index];
        await client.query(
          `INSERT INTO flow_steps
             (flow_id, position, kind, role_id, guard_operator, guard_amount_minor)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            flowId,
            index,
            step.kind,
            step.kind === "role" ? step.roleId : null,
            step.guard?.operator ?? null,
            step.guard?.amountMinor ?? null,
          ],
        );
      }
      await client.query("COMMIT");
      return {
        id: flowId,
        name: input.name,
        roleId: input.roleId,
        status: existingStatus,
        steps: [...input.steps],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async publishFlow(flowId: string): Promise<FlowDraft> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const flowResult = await client.query<Row>(
        "SELECT id, organization_id, name, role_id, status FROM flows WHERE id = $1",
        [flowId],
      );
      if (flowResult.rows.length === 0) {
        throw new AdminError("not-found", "Flow does not exist.");
      }
      const flowRow = flowResult.rows[0];
      await client.query("UPDATE flows SET status = 'published', updated_at = now() WHERE id = $1", [
        flowId,
      ]);
      await client.query("COMMIT");
      const steps = await this.loadSteps(flowId);
      return {
        id: flowId,
        name: String(flowRow.name),
        roleId: String(flowRow.role_id),
        status: "published",
        steps,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteFlow(flowId: string): Promise<void> {
    await this.pool.query("DELETE FROM flows WHERE id = $1", [flowId]);
  }

  private async loadSteps(flowId: string): Promise<FlowStepInput[]> {
    const result = await this.pool.query<Row>(
      `SELECT kind, role_id, guard_operator, guard_amount_minor
       FROM flow_steps WHERE flow_id = $1 ORDER BY position`,
      [flowId],
    );
    return result.rows.map(flowStepFromRow);
  }

  async listFlows(organizationId: string): Promise<FlowDraft[]> {
    const flows = await this.pool.query<Row>(
      `SELECT id, organization_id, name, role_id, status, created_at, updated_at
       FROM flows
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [organizationId],
    );
    const steps = await this.pool.query<Row>(
      `
        SELECT fs.flow_id, fs.kind, fs.role_id, fs.guard_operator, fs.guard_amount_minor
        FROM flow_steps fs
        WHERE fs.flow_id IN (
          SELECT id FROM flows WHERE organization_id = $1
        )
        ORDER BY fs.flow_id, fs.position
      `,
      [organizationId],
    );
    const stepsByFlow = new Map<string, FlowStepInput[]>();
    for (const step of steps.rows) {
      const flowId = String(step.flow_id);
      const list = stepsByFlow.get(flowId) ?? [];
      list.push(flowStepFromRow(step));
      stepsByFlow.set(flowId, list);
    }
    return flows.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      roleId: String(row.role_id),
      status: flowStatusFromRow(row),
      steps: stepsByFlow.get(String(row.id)) ?? [],
    }));
  }

  async appendAudit(organizationId: string, event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (id, organization_id, actor_id, action, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.id, organizationId, event.actorId, event.action, event.detail, event.createdAt],
    );
  }

  async listAuditEvents(
    organizationId: string,
    filter: AuditFilter,
    pagination: { page: number; pageSize: number },
  ): Promise<{ events: AuditEvent[]; total: number }> {
    // The WHERE clause is assembled from fixed fragments with sequential
    // placeholders; every value travels as a query parameter, never
    // interpolated into the SQL text.
    const conditions = ["organization_id = $1"];
    const filterValues: unknown[] = [organizationId];
    if (filter.actorId) {
      filterValues.push(filter.actorId);
      conditions.push(`actor_id = $${filterValues.length}`);
    }
    if (filter.action) {
      filterValues.push(filter.action);
      conditions.push(`action = $${filterValues.length}`);
    }
    const { from, to } = auditRangeBounds(filter);
    if (from) {
      filterValues.push(from);
      conditions.push(`created_at >= $${filterValues.length}`);
    }
    if (to) {
      filterValues.push(to);
      conditions.push(`created_at < $${filterValues.length}`);
    }
    const where = conditions.join(" AND ");
    const [rows, countResult] = await Promise.all([
      this.pool.query<Row>(
        `SELECT id, organization_id, actor_id, action, detail, created_at
         FROM audit_events
         WHERE ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`,
        [...filterValues, pagination.pageSize, (pagination.page - 1) * pagination.pageSize],
      ),
      this.pool.query<Row>(
        `SELECT count(*) AS count
         FROM audit_events
         WHERE ${where}`,
        filterValues,
      ),
    ]);
    const total = Number(countResult.rows[0]?.count ?? 0);
    return { events: rows.rows.map(auditEventFromRow), total };
  }

  async getAbsenceTimeoutDays(organizationId: string): Promise<number> {
    const result = await this.pool.query<Row>(
      "SELECT absence_timeout_days FROM organization_settings WHERE organization_id = $1",
      [organizationId],
    );
    return result.rows.length > 0
      ? Number(result.rows[0].absence_timeout_days)
      : DEFAULT_ABSENCE_TIMEOUT_DAYS;
  }

  async setAbsenceTimeoutDays(organizationId: string, days: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO organization_settings (organization_id, absence_timeout_days)
       VALUES ($1, $2)
       ON CONFLICT (organization_id) DO UPDATE SET absence_timeout_days = EXCLUDED.absence_timeout_days`,
      [organizationId, days],
    );
  }

  async listOrganizations(): Promise<string[]> {
    const result = await this.pool.query<Row>("SELECT id FROM organizations ORDER BY id");
    return result.rows.map((row) => String(row.id));
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505" &&
    (error as { constraint?: unknown }).constraint === constraint
  );
}
