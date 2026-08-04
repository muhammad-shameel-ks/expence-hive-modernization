import type { Pool } from "pg";
import type {
  ExpenseClaim,
  ExpenseEmployee,
  ExpenseHistoryEvent,
  ExpenseStage,
  ExpenseStep,
  ExpenseStore,
} from "./ports";

type Row = Record<string, unknown>;

export class PostgresExpenseStore implements ExpenseStore {
  constructor(private readonly pool: Pool) {}

  async getEmployee(id: string): Promise<ExpenseEmployee | null> {
    const result = await this.pool.query<Row>(employeeQuery, [id]);
    return result.rows.length > 0 ? employeeFromRow(result.rows[0]) : null;
  }

  async listEmployees(organizationId: string): Promise<ExpenseEmployee[]> {
    const result = await this.pool.query<Row>(employeeQuery.replace("WHERE e.id = $1", "WHERE e.organization_id = $1"), [organizationId]);
    return result.rows.map(employeeFromRow);
  }

  async listClaimsForEmployee(employee: ExpenseEmployee): Promise<ExpenseClaim[]> {
    const result = await this.pool.query<Row>(
      `SELECT rc.*
       FROM reimbursement_claims rc
       WHERE rc.organization_id = $1
         AND (rc.requester_id = $2 OR rc.current_actor_id = $2)
       ORDER BY COALESCE(rc.submitted_at, rc.created_at) DESC`,
      [employee.organizationId, employee.id],
    );
    return Promise.all(result.rows.map(async (row) => {
      const claim = claimFromRow(row);
      const [attachmentResult, stepResult, historyResult] = await Promise.all([
        this.pool.query<Row>("SELECT * FROM claim_attachments WHERE claim_id = $1 ORDER BY created_at LIMIT 1", [claim.id]),
        this.pool.query<Row>("SELECT * FROM claim_approval_steps WHERE claim_id = $1 ORDER BY position", [claim.id]),
        this.pool.query<Row>("SELECT * FROM claim_history_events WHERE claim_id = $1 ORDER BY created_at, id", [claim.id]),
      ]);
      const attachment = attachmentResult.rows[0];
      claim.attachment = attachment
        ? { id: String(attachment.id), fileName: String(attachment.file_name), contentType: String(attachment.content_type), storageKey: String(attachment.storage_key), status: "available" }
        : undefined;
      claim.steps = stepResult.rows.map(stepFromRow);
      claim.history = historyResult.rows.map(historyFromRow);
      return claim;
    }));
  }

  async createClaim(claim: ExpenseClaim): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await insertClaim(client, claim);
      await insertHistory(client, claim);
      if (claim.attachment) {
        await client.query(
          `INSERT INTO claim_attachments (id, claim_id, file_name, content_type, storage_key, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [claim.attachment.id, claim.id, claim.attachment.fileName, claim.attachment.contentType, claim.attachment.storageKey, claim.attachment.status],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getClaim(id: string): Promise<ExpenseClaim | null> {
    const claimResult = await this.pool.query<Row>("SELECT * FROM reimbursement_claims WHERE id = $1", [id]);
    if (claimResult.rows.length === 0) return null;
    const claim = claimFromRow(claimResult.rows[0]);
    const [attachmentResult, stepResult, historyResult] = await Promise.all([
      this.pool.query<Row>("SELECT * FROM claim_attachments WHERE claim_id = $1 ORDER BY created_at LIMIT 1", [id]),
      this.pool.query<Row>("SELECT * FROM claim_approval_steps WHERE claim_id = $1 ORDER BY position", [id]),
      this.pool.query<Row>("SELECT * FROM claim_history_events WHERE claim_id = $1 ORDER BY created_at, id", [id]),
    ]);
    const attachment = attachmentResult.rows[0];
    claim.attachment = attachment
      ? {
          id: String(attachment.id),
          fileName: String(attachment.file_name),
          contentType: String(attachment.content_type),
          storageKey: String(attachment.storage_key),
          status: "available",
        }
      : undefined;
    claim.steps = stepResult.rows.map(stepFromRow);
    claim.history = historyResult.rows.map(historyFromRow);
    return claim;
  }

  async updateClaim(claim: ExpenseClaim): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE reimbursement_claims
         SET status = $2, current_stage = $3, current_actor_id = $4, version = $5, submitted_at = $6, updated_at = now()
         WHERE id = $1 AND version < $5`,
        [claim.id, claim.status, claim.currentStage ?? null, claim.currentActorId ?? null, claim.version, claim.submittedAt ?? null],
      );
      if (result.rowCount !== 1) throw new Error("Claim was changed by another request.");
      for (let position = 0; position < claim.steps.length; position += 1) {
        const step = claim.steps[position];
        await client.query(
          `INSERT INTO claim_approval_steps (id, claim_id, position, stage, assigned_actor_id, status, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, decided_at = EXCLUDED.decided_at`,
          [step.id, claim.id, position, step.stage, step.assignedActorId, step.status, step.decidedAt ?? null],
        );
      }
      await insertHistory(client, claim);
      const verifiedEvent = [...claim.history].reverse().find((event) => event.kind === "verified");
      const paidEvent = [...claim.history].reverse().find((event) => event.kind === "paid");
      if (verifiedEvent || paidEvent) {
        await client.query(
          `INSERT INTO claim_payments (claim_id, verifier_id, verified_at, payment_actor_id, paid_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (claim_id) DO UPDATE SET
             verifier_id = COALESCE(EXCLUDED.verifier_id, claim_payments.verifier_id),
             verified_at = COALESCE(EXCLUDED.verified_at, claim_payments.verified_at),
             payment_actor_id = COALESCE(EXCLUDED.payment_actor_id, claim_payments.payment_actor_id),
             paid_at = COALESCE(EXCLUDED.paid_at, claim_payments.paid_at)`,
          [claim.id, verifiedEvent?.actorId ?? null, verifiedEvent?.createdAt ?? null, paidEvent?.actorId ?? null, paidEvent?.createdAt ?? null],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

const employeeQuery = `
  SELECT e.id, e.organization_id, e.name,
         COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS role_codes,
         ha.manager_id
  FROM employees e
  LEFT JOIN employee_roles er ON er.employee_id = e.id
  LEFT JOIN roles r ON r.id = er.role_id
  LEFT JOIN hierarchy_assignments ha ON ha.employee_id = e.id
  WHERE e.id = $1
  GROUP BY e.id, ha.manager_id
`;

function employeeFromRow(row: Row): ExpenseEmployee {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    roleCodes: Array.isArray(row.role_codes) ? row.role_codes.map(String) as ExpenseEmployee["roleCodes"] : [],
    managerId: row.manager_id ? String(row.manager_id) : undefined,
  };
}

async function insertClaim(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, claim: ExpenseClaim): Promise<void> {
  await client.query(
    `INSERT INTO reimbursement_claims
      (id, organization_id, requester_id, reference, title, category, amount_minor, currency, expense_date, payment_method, status, current_stage, current_actor_id, version, created_at, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [claim.id, claim.organizationId, claim.requesterId, claim.ref, claim.title, claim.category, claim.amountMinor, claim.currency, claim.expenseDate, claim.paymentMethod, claim.status, claim.currentStage ?? null, claim.currentActorId ?? null, claim.version, claim.createdAt, claim.submittedAt ?? null],
  );
}

async function insertHistory(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, claim: ExpenseClaim): Promise<void> {
  for (const event of claim.history) {
    await client.query(
      `INSERT INTO claim_history_events (id, claim_id, kind, actor_id, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [event.id, claim.id, event.kind, event.actorId, event.detail ?? null, event.createdAt],
    );
  }
}

function claimFromRow(row: Row): ExpenseClaim {
  return {
    id: String(row.id),
    ref: String(row.reference),
    organizationId: String(row.organization_id),
    requesterId: String(row.requester_id),
    title: String(row.title),
    category: String(row.category),
    amountMinor: Number(row.amount_minor),
    currency: "INR",
    expenseDate: String(row.expense_date).slice(0, 10),
    paymentMethod: String(row.payment_method) as ExpenseClaim["paymentMethod"],
    status: String(row.status) as ExpenseClaim["status"],
    currentStage: row.current_stage ? String(row.current_stage) as ExpenseStage : undefined,
    currentActorId: row.current_actor_id ? String(row.current_actor_id) : undefined,
    steps: [],
    history: [],
    version: Number(row.version),
    createdAt: new Date(String(row.created_at)).toISOString(),
    submittedAt: row.submitted_at ? new Date(String(row.submitted_at)).toISOString() : undefined,
  };
}

function stepFromRow(row: Row): ExpenseStep {
  return {
    id: String(row.id),
    stage: String(row.stage) as ExpenseStage,
    assignedActorId: String(row.assigned_actor_id),
    status: String(row.status) as ExpenseStep["status"],
    decidedAt: row.decided_at ? new Date(String(row.decided_at)).toISOString() : undefined,
  };
}

function historyFromRow(row: Row): ExpenseHistoryEvent {
  return {
    id: String(row.id),
    kind: String(row.kind) as ExpenseHistoryEvent["kind"],
    actorId: String(row.actor_id),
    detail: row.detail ? String(row.detail) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
