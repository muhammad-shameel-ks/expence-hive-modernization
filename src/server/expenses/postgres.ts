import type { Pool } from "pg";
import type { ReceiptContentType } from "../blob/keys";
import { guardFromRow } from "../shared/amount-guard";
import { ExpenseError } from "./commands";
import type {
  ActivityEntry,
  ExpenseAttachment,
  ExpenseClaim,
  ExpenseEmployee,
  ExpenseFlow,
  ExpenseHistoryEvent,
  ExpenseStep,
  ExpenseStore,
  FlowStepTarget,
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
    // Besides claims the employee raised or is currently assigned to, an
    // active holder of the terminal stage's role also sees every in-finance
    // claim of that stage: the terminal stage is a pool (stories 13/14), so
    // claims assigned to another pool member must still surface for the
    // holder to verify or mark paid. The claim's current stage is the
    // terminal one whenever status is in-finance, so any pending/verified
    // step with the holder's role is that stage.
    const result = await this.pool.query<Row>(
      `SELECT rc.*
       FROM reimbursement_claims rc
       WHERE rc.organization_id = $1
         AND (
           rc.requester_id = $2
           OR rc.current_actor_id = $2
           OR (
             rc.status = 'in-finance'
             AND EXISTS (
               SELECT 1
               FROM claim_approval_steps s
               JOIN employee_roles er ON er.employee_id = $2 AND er.role_id = s.role_id
               WHERE s.claim_id = rc.id AND s.status IN ('pending', 'verified')
             )
           )
         )
       ORDER BY COALESCE(rc.submitted_at, rc.created_at) DESC`,
      [employee.organizationId, employee.id],
    );
    return this.hydrateClaims(result.rows);
  }

  async listClaimsForOrganization(organizationId: string): Promise<ExpenseClaim[]> {
    const result = await this.pool.query<Row>(
      `SELECT rc.*
       FROM reimbursement_claims rc
       WHERE rc.organization_id = $1
       ORDER BY COALESCE(rc.submitted_at, rc.created_at) DESC`,
      [organizationId],
    );
    return this.hydrateClaims(result.rows);
  }

  private async hydrateClaims(rows: Row[]): Promise<ExpenseClaim[]> {
    return Promise.all(rows.map(async (row) => {
      const claim = claimFromRow(row);
      const [attachmentResult, stepResult, historyResult] = await Promise.all([
        this.pool.query<Row>("SELECT * FROM claim_attachments WHERE claim_id = $1 ORDER BY created_at LIMIT 1", [claim.id]),
        this.pool.query<Row>("SELECT * FROM claim_approval_steps WHERE claim_id = $1 ORDER BY position", [claim.id]),
        this.pool.query<Row>("SELECT * FROM claim_history_events WHERE claim_id = $1 ORDER BY created_at, id", [claim.id]),
      ]);
      const attachment = attachmentResult.rows[0];
      claim.attachment = attachment ? attachmentFromRow(attachment) : undefined;
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
          `INSERT INTO claim_attachments (id, claim_id, file_name, content_type, storage_key, status, content_sha256, size_bytes, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            claim.attachment.id, claim.id, claim.attachment.fileName, claim.attachment.contentType,
            claim.attachment.storageKey, claim.attachment.status, claim.attachment.contentSha256,
            claim.attachment.sizeBytes, claim.attachment.uploadedAt,
          ],
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
    claim.attachment = attachment ? attachmentFromRow(attachment) : undefined;
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
         SET title = $2, category = $3, sub_category = $4, remark = $5, amount_minor = $6, expense_date = $7,
             status = $8, current_stage = $9, current_actor_id = $10, current_stage_since = $11, version = $12, submitted_at = $13, comments = $14, updated_at = now()
         WHERE id = $1 AND version < $12`,
        [
          claim.id,
          claim.title,
          claim.category,
          claim.subCategory,
          claim.remark,
          claim.amountMinor,
          claim.expenseDate,
          claim.status,
          claim.currentStage ?? null,
          claim.currentActorId ?? null,
          claim.currentStageSince ?? null,
          claim.version,
          claim.submittedAt ?? null,
          claim.comments ?? null,
        ],
      );
      if (result.rowCount !== 1) throw new ExpenseError("conflict", "Claim was changed by another request.");
      if (claim.attachment) {
        // The claim has at most one attachment (created with the claim or
        // added while editing a draft); the id is the conflict target.
        await client.query(
          `INSERT INTO claim_attachments (id, claim_id, file_name, content_type, storage_key, status, content_sha256, size_bytes, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             file_name = EXCLUDED.file_name, content_type = EXCLUDED.content_type,
             storage_key = EXCLUDED.storage_key, status = EXCLUDED.status,
             content_sha256 = EXCLUDED.content_sha256, size_bytes = EXCLUDED.size_bytes, uploaded_at = EXCLUDED.uploaded_at`,
          [
            claim.attachment.id,
            claim.id,
            claim.attachment.fileName,
            claim.attachment.contentType,
            claim.attachment.storageKey,
            claim.attachment.status,
            claim.attachment.contentSha256,
            claim.attachment.sizeBytes,
            claim.attachment.uploadedAt,
          ],
        );
      }
      for (let position = 0; position < claim.steps.length; position += 1) {
        const step = claim.steps[position];
        await client.query(
          `INSERT INTO claim_approval_steps (id, claim_id, position, role_id, assigned_actor_id, status, decided_at, skip_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, assigned_actor_id = EXCLUDED.assigned_actor_id, skip_reason = EXCLUDED.skip_reason`,
          [step.id, claim.id, position, step.roleId, step.assignedActorId ?? null, step.status, step.decidedAt ?? null, step.skipReason ?? null],
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

  async deleteClaim(id: string, version: number): Promise<void> {
    const result = await this.pool.query(
      "DELETE FROM reimbursement_claims WHERE id = $1 AND status = 'draft' AND version = $2",
      [id, version],
    );
    if (result.rowCount !== 1) {
      throw new ExpenseError("conflict", "Claim was changed by another request.");
    }
  }

  async getPublishedFlowForRole(organizationId: string, roleId: string): Promise<ExpenseFlow | null> {
    const flowResult = await this.pool.query<Row>(
      `SELECT id, role_id FROM flows WHERE organization_id = $1 AND role_id = $2 AND status = 'published' LIMIT 1`,
      [organizationId, roleId],
    );
    if (flowResult.rows.length === 0) return null;
    const flowId = String(flowResult.rows[0].id);
    const stepsResult = await this.pool.query<Row>(
      "SELECT kind, role_id, guard_operator, guard_amount_minor FROM flow_steps WHERE flow_id = $1 ORDER BY position",
      [flowId],
    );
    return {
      id: flowId,
      roleId: String(flowResult.rows[0].role_id),
      steps: stepsResult.rows.map(flowStepFromRow),
    };
  }

  async listActivityForActor(
    organizationId: string,
    actorId: string,
    kinds: readonly ExpenseHistoryEvent["kind"][],
  ): Promise<ActivityEntry[]> {
    const result = await this.pool.query<Row>(
      `${ACTIVITY_SELECT} WHERE rc.organization_id = $1 AND che.actor_id = $2 AND che.kind = ANY($3::text[])
       ORDER BY che.created_at DESC, che.id DESC`,
      [organizationId, actorId, kinds],
    );
    return result.rows.map(activityFromRow);
  }

  async listActivityForOrganization(
    organizationId: string,
    kinds: readonly ExpenseHistoryEvent["kind"][],
  ): Promise<ActivityEntry[]> {
    const result = await this.pool.query<Row>(
      `${ACTIVITY_SELECT} WHERE rc.organization_id = $1 AND che.actor_id IS NOT NULL AND che.kind = ANY($2::text[])
       ORDER BY che.created_at DESC, che.id DESC`,
      [organizationId, kinds],
    );
    return result.rows.map(activityFromRow);
  }
}

const ACTIVITY_SELECT = `
  SELECT che.id, che.claim_id, che.kind, che.detail, che.created_at,
         rc.reference, rc.title, rc.category, rc.amount_minor, rc.currency,
         rc.requester_id, requester.name AS requester_name,
         che.actor_id, actor.name AS actor_name
  FROM claim_history_events che
  JOIN reimbursement_claims rc ON rc.id = che.claim_id
  JOIN employees requester ON requester.id = rc.requester_id
  JOIN employees actor ON actor.id = che.actor_id
`;

function activityFromRow(row: Row): ActivityEntry {
  return {
    id: String(row.id),
    claimId: String(row.claim_id),
    claimRef: String(row.reference),
    claimTitle: String(row.title),
    claimCategory: String(row.category),
    claimAmountMinor: Number(row.amount_minor),
    claimCurrency: String(row.currency),
    requesterId: String(row.requester_id),
    requesterName: String(row.requester_name),
    actorId: String(row.actor_id),
    actorName: String(row.actor_name),
    kind: String(row.kind) as ExpenseHistoryEvent["kind"],
    detail: row.detail ? String(row.detail) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

const employeeQuery = `
  SELECT e.id, e.organization_id, e.name, e.department_id, e.active,
         r.id AS role_id, r.code AS role_code, r.display_name AS role_name, r.department_id AS role_department_id,
         ha.manager_id
  FROM employees e
  LEFT JOIN LATERAL (
    SELECT role_id FROM employee_roles WHERE employee_id = e.id ORDER BY role_id LIMIT 1
  ) er ON true
  LEFT JOIN roles r ON r.id = er.role_id
  LEFT JOIN hierarchy_assignments ha ON ha.employee_id = e.id
  WHERE e.id = $1
`;

function employeeFromRow(row: Row): ExpenseEmployee {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    departmentId: row.department_id ? String(row.department_id) : null,
    active: Boolean(row.active),
    role: row.role_id
      ? {
          id: String(row.role_id),
          code: String(row.role_code),
          displayName: String(row.role_name),
          departmentId: row.role_department_id ? String(row.role_department_id) : null,
        }
      : null,
    managerId: row.manager_id ? String(row.manager_id) : null,
  };
}

async function insertClaim(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, claim: ExpenseClaim): Promise<void> {
  await client.query(
    `INSERT INTO reimbursement_claims
      (id, organization_id, requester_id, reference, title, category, sub_category, remark, amount_minor, currency, expense_date, status, current_stage, current_actor_id, current_stage_since, version, created_at, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      claim.id, claim.organizationId, claim.requesterId, claim.ref, claim.title, claim.category, claim.subCategory, claim.remark, claim.amountMinor, claim.currency, claim.expenseDate, claim.status, claim.currentStage ?? null, claim.currentActorId ?? null, claim.currentStageSince ?? null, claim.version, claim.createdAt, claim.submittedAt ?? null,
    ],
  );
}

async function insertHistory(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, claim: ExpenseClaim): Promise<void> {
  for (const event of claim.history) {
    await client.query(
      `INSERT INTO claim_history_events (id, claim_id, kind, actor_id, actor_name, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [event.id, claim.id, event.kind, event.actorId ?? null, event.actorName ?? null, event.detail ?? null, event.createdAt],
    );
  }
}

function expenseDateColumn(value: unknown): string {
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function claimFromRow(row: Row): ExpenseClaim {
  return {
    id: String(row.id),
    ref: String(row.reference),
    organizationId: String(row.organization_id),
    requesterId: String(row.requester_id),
    title: String(row.title),
    category: String(row.category),
    subCategory: row.sub_category ? String(row.sub_category) : "",
    remark: row.remark ? String(row.remark) : "",
    amountMinor: Number(row.amount_minor),
    currency: "INR",
    // node-postgres parses DATE columns into Date objects at local
    // midnight; both String() and toISOString() mangle the day. Format from
    // the local date components to the yyyy-mm-dd shape the domain and the
    // date inputs expect.
    expenseDate: expenseDateColumn(row.expense_date),
    status: String(row.status) as ExpenseClaim["status"],
    currentStage: row.current_stage ? String(row.current_stage) : undefined,
    currentActorId: row.current_actor_id ? String(row.current_actor_id) : undefined,
    currentStageSince: row.current_stage_since ? new Date(String(row.current_stage_since)).toISOString() : undefined,
    steps: [],
    history: [],
    version: Number(row.version),
    createdAt: new Date(String(row.created_at)).toISOString(),
    submittedAt: row.submitted_at ? new Date(String(row.submitted_at)).toISOString() : undefined,
    comments: row.comments ? String(row.comments) : undefined,
  };
}

function attachmentFromRow(row: Row): ExpenseAttachment {
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    contentType: String(row.content_type) as ReceiptContentType,
    storageKey: String(row.storage_key),
    status: "available",
    contentSha256: String(row.content_sha256),
    sizeBytes: Number(row.size_bytes),
    uploadedAt: new Date(String(row.uploaded_at)).toISOString(),
  };
}

function stepFromRow(row: Row): ExpenseStep {
  return {
    id: String(row.id),
    roleId: row.role_id ? String(row.role_id) : null,
    assignedActorId: row.assigned_actor_id ? String(row.assigned_actor_id) : undefined,
    status: String(row.status) as ExpenseStep["status"],
    decidedAt: row.decided_at ? new Date(String(row.decided_at)).toISOString() : undefined,
    skipReason: row.skip_reason ? String(row.skip_reason) : undefined,
  };
}

function flowStepFromRow(row: Row): FlowStepTarget {
  const guard = guardFromRow(row);
  return row.kind === "team-lead"
    ? { kind: "team-lead", guard }
    : { kind: "role", roleId: String(row.role_id), guard };
}

function historyFromRow(row: Row): ExpenseHistoryEvent {
  return {
    id: String(row.id),
    kind: String(row.kind) as ExpenseHistoryEvent["kind"],
    actorId: row.actor_id ? String(row.actor_id) : undefined,
    actorName: row.actor_name ? String(row.actor_name) : undefined,
    detail: row.detail ? String(row.detail) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
