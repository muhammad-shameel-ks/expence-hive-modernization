import { Pool } from "pg";
import { AdminError } from "./commands";
import type {
  AdminDepartment,
  AdminEmployee,
  AdminRole,
  AdminStore,
  AuditEvent,
  DepartmentInput,
  FlowDraft,
  FlowInput,
  FlowStatus,
  RoleInput,
} from "./ports";

type Row = Record<string, unknown>;

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

function roleRefFromRow(row: Row): AdminEmployee["role"] {
  if (row.role_id === null || row.role_id === undefined) {
    return null;
  }
  return {
    id: String(row.role_id),
    code: String(row.role_code),
    displayName: String(row.role_name),
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
    role: roleRefFromRow(row),
  };
}

function roleFromRow(row: Row): AdminRole {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    displayName: String(row.display_name),
    departmentId: row.department_id === null ? null : String(row.department_id),
    active: Boolean(row.active),
  };
}

function departmentFromRow(row: Row): AdminDepartment {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    active: Boolean(row.active),
  };
}

function flowStatusFromRow(row: Row): FlowStatus {
  return row.status === "published" ? "published" : row.status === "archived" ? "archived" : "draft";
}

export class PostgresAdminStore implements AdminStore {
  constructor(private readonly pool: Pool) {}

  async listEmployees(organizationId: string): Promise<AdminEmployee[]> {
    const result = await this.pool.query<Row>(
      `
        SELECT e.id, e.organization_id, e.name, e.email, d.name AS department_name,
          r.id AS role_id, r.code AS role_code, r.display_name AS role_name
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        ${employeeRoleJoin}
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
        SELECT e.id, e.organization_id, e.name, e.email, d.name AS department_name,
          r.id AS role_id, r.code AS role_code, r.display_name AS role_name
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        ${employeeRoleJoin}
        WHERE e.id = $1
      `,
      [id],
    );
    return result.rows.length > 0 ? employeeFromRow(result.rows[0]) : null;
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

  async listDepartments(organizationId: string): Promise<AdminDepartment[]> {
    const result = await this.pool.query<Row>(
      "SELECT id, organization_id, name, active FROM departments WHERE organization_id = $1 ORDER BY name",
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
        "INSERT INTO departments (id, organization_id, name) VALUES ($1, $2, $3)",
        [id, organizationId, input.name],
      );
    } catch (error) {
      if (isUniqueViolation(error, "idx_departments_org_name")) {
        throw new AdminError("validation", `A department named "${input.name}" already exists.`);
      }
      throw error;
    }
    return { id, organizationId, name: input.name, active: true };
  }

  async deactivateDepartment(departmentId: string): Promise<void> {
    await this.pool.query("UPDATE departments SET active = false WHERE id = $1", [departmentId]);
  }

  async listRoles(organizationId: string): Promise<AdminRole[]> {
    const result = await this.pool.query<Row>(
      "SELECT id, organization_id, code, display_name, department_id, active FROM roles WHERE organization_id = $1 ORDER BY display_name",
      [organizationId],
    );
    return result.rows.map(roleFromRow);
  }

  async getRole(roleId: string): Promise<AdminRole | null> {
    const result = await this.pool.query<Row>(
      "SELECT id, organization_id, code, display_name, department_id, active FROM roles WHERE id = $1",
      [roleId],
    );
    return result.rows.length > 0 ? roleFromRow(result.rows[0]) : null;
  }

  async createRole(organizationId: string, input: RoleInput): Promise<AdminRole> {
    const id = `role-${crypto.randomUUID()}`;
    try {
      await this.pool.query(
        "INSERT INTO roles (id, organization_id, code, display_name, department_id) VALUES ($1, $2, $3, $4, $5)",
        [id, organizationId, input.code, input.displayName, input.departmentId],
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
      departmentId: input.departmentId,
      active: true,
    };
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
        await client.query(
          "INSERT INTO flow_steps (flow_id, position, role_id) VALUES ($1, $2, $3)",
          [flowId, index, input.steps[index]],
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
      await client.query(
        "UPDATE flows SET status = 'archived' WHERE role_id = $1 AND status = 'published'",
        [flowRow.role_id],
      );
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

  private async loadSteps(flowId: string): Promise<string[]> {
    const result = await this.pool.query<Row>(
      "SELECT role_id FROM flow_steps WHERE flow_id = $1 ORDER BY position",
      [flowId],
    );
    return result.rows.map((row) => String(row.role_id));
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
        SELECT fs.flow_id, fs.role_id
        FROM flow_steps fs
        WHERE fs.flow_id IN (
          SELECT id FROM flows WHERE organization_id = $1
        )
        ORDER BY fs.flow_id, fs.position
      `,
      [organizationId],
    );
    const stepsByFlow = new Map<string, string[]>();
    for (const step of steps.rows) {
      const flowId = String(step.flow_id);
      const list = stepsByFlow.get(flowId) ?? [];
      list.push(String(step.role_id));
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
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505" &&
    (error as { constraint?: unknown }).constraint === constraint
  );
}
