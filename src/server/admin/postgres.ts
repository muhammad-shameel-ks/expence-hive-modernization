import { Pool } from "pg";
import { AdminError } from "./commands";
import {
  isAdminRole,
  type AdminEmployee,
  type AdminRole,
  type AdminStore,
  type AuditEvent,
  type FlowDraft,
  type FlowInput,
} from "./ports";

type Row = Record<string, unknown>;

function roleFromRow(row: Row): AdminRole | null {
  const displayName = row.role_name;
  return typeof displayName === "string" && isAdminRole(displayName) ? displayName : null;
}

function employeeFromRow(row: Row): AdminEmployee {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    email: String(row.email),
    department: String(row.department),
    role: roleFromRow(row),
  };
}

function flowStatusFromRow(row: Row): "draft" | "published" {
  return row.status === "published" ? "published" : "draft";
}

export class PostgresAdminStore implements AdminStore {
  constructor(private readonly pool: Pool) {}

  async listEmployees(organizationId: string): Promise<AdminEmployee[]> {
    const result = await this.pool.query<Row>(
      `
        SELECT DISTINCT e.id, e.organization_id, e.name, e.email, e.department, r.display_name AS role_name
        FROM employees e
        LEFT JOIN employee_roles er ON er.employee_id = e.id
        LEFT JOIN roles r ON r.id = er.role_id
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
        SELECT e.id, e.organization_id, e.name, e.email, e.department, r.display_name AS role_name
        FROM employees e
        LEFT JOIN employee_roles er ON er.employee_id = e.id
        LEFT JOIN roles r ON r.id = er.role_id
        WHERE e.id = $1
      `,
      [id],
    );
    return result.rows.length > 0 ? employeeFromRow(result.rows[0]) : null;
  }

  // This slice models one administration role per employee (ADR 0002), so
  // assignment replaces any previously assigned role instead of adding one.
  async setEmployeeRole(employeeId: string, role: AdminRole): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM employee_roles WHERE employee_id = $1", [employeeId]);
      const roleResult = await client.query<Row>(
        `SELECT r.id
         FROM roles r
         JOIN employees e ON e.organization_id = r.organization_id
         WHERE r.display_name = $1 AND e.id = $2`,
        [role, employeeId],
      );
      if (roleResult.rows.length === 0) {
        throw new AdminError(
          "validation",
          `Role "${role}" is not seeded in this organization.`,
        );
      }
      await client.query(
        "INSERT INTO employee_roles (employee_id, role_id) VALUES ($1, $2)",
        [employeeId, roleResult.rows[0].id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createFlow(organizationId: string, input: FlowInput): Promise<FlowDraft> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const flowId = `flow-${crypto.randomUUID()}`;
      await client.query(
        `INSERT INTO flows (id, organization_id, name, scope, status)
         VALUES ($1, $2, $3, $4, 'draft')`,
        [flowId, organizationId, input.name, input.scope],
      );
      for (let index = 0; index < input.steps.length; index += 1) {
        const roleResult = await client.query<Row>(
          "SELECT id FROM roles WHERE display_name = $1 AND organization_id = $2",
          [input.steps[index], organizationId],
        );
        if (roleResult.rows.length === 0) {
          throw new AdminError(
            "validation",
            `Role "${input.steps[index]}" is not seeded in this organization.`,
          );
        }
        await client.query(
          "INSERT INTO flow_steps (flow_id, position, role_id) VALUES ($1, $2, $3)",
          [flowId, index, roleResult.rows[0].id],
        );
      }
      await client.query("COMMIT");
      return {
        id: flowId,
        name: input.name,
        scope: input.scope,
        status: "draft",
        steps: [...input.steps],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        throw new AdminError(
          "validation",
          `A draft flow named "${input.name}" for ${input.scope} already exists.`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listFlows(organizationId: string): Promise<FlowDraft[]> {
    const flows = await this.pool.query<Row>(
      `SELECT id, organization_id, name, scope, status, created_at, updated_at
       FROM flows
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [organizationId],
    );
    const steps = await this.pool.query<Row>(
      `
        SELECT fs.flow_id, r.display_name
        FROM flow_steps fs
        JOIN roles r ON r.id = fs.role_id
        WHERE fs.flow_id IN (
          SELECT id FROM flows WHERE organization_id = $1
        )
        ORDER BY fs.flow_id, fs.position
      `,
      [organizationId],
    );
    const stepsByFlow = new Map<string, AdminRole[]>();
    for (const step of steps.rows) {
      const flowId = String(step.flow_id);
      const displayName = String(step.display_name);
      if (!isAdminRole(displayName)) {
        continue;
      }
      const list = stepsByFlow.get(flowId) ?? [];
      list.push(displayName);
      stepsByFlow.set(flowId, list);
    }
    return flows.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      scope: String(row.scope),
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505" &&
    (!("constraint" in error) ||
      (error as { constraint?: unknown }).constraint ===
        "idx_flows_org_name_scope_draft")
  );
}
