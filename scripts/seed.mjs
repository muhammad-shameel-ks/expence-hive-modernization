// Seeds the local expense foundation: organization, employees, roles, hierarchy, flow, and claims.
// Idempotent: safe to run repeatedly after migrations.
// Usage: npm run db:seed

import { Pool } from "pg";
import { databaseUrl } from "../src/server/db/connection.mjs";

const ORGANIZATION = { id: "org-1", name: "Hive" };

const EMPLOYEES = [
  { id: "emp-ada", name: "Ada Lovelace", email: "ada@hive.local", department: "Engineering" },
  { id: "emp-grace", name: "Grace Hopper", email: "grace@hive.local", department: "Operations" },
  { id: "emp-katherine", name: "Katherine Johnson", email: "katherine@hive.local", department: "Engineering" },
  { id: "emp-dorothy", name: "Dorothy Vaughan", email: "dorothy@hive.local", department: "Finance" },
  { id: "emp-superadmin", name: "Super Admin", email: "superadmin@hive.local", department: "Executive" },
  { id: "emp-finance", name: "Finance Officer", email: "finance@hive.local", department: "Finance" },
  { id: "emp-it", name: "IT Head", email: "it@hive.local", department: "IT" },
  { id: "emp-shameel", name: "Muhammad Shameel", email: "muhammadshameelks@hive.local", department: "Engineering" },
  { id: "emp-abilash", name: "Abilash", email: "abilash@hive.local", department: "IT" },
  { id: "emp-sanil", name: "Sanil Davis", email: "sanil@hive.local", department: "IT" },
  { id: "emp-arun", name: "Arun Kumar", email: "arun@hive.local", department: "IT" },
  { id: "emp-pramod", name: "Pramod", email: "pramod@hive.local", department: "IT" },
  { id: "emp-rishikesh", name: "Rishikesh", email: "rishikesh@hive.local", department: "IT" },
];

const DEPARTMENTS = ["Engineering", "Operations", "Finance", "IT", "Executive"];

// Admin-console and claim/payment-authorization roles share one table
// (see docs/domain-model/approval-workflow.md). Roles without a department
// are organization-wide by design (Superadmin, HR administrator); the
// expense-side roles (manager/it-reviewer/finance-reviewer/hr/employee)
// stay department-agnostic here because per-department role scoping is not
// yet exercised by the seed data (tracked as follow-up work). CEO and CEO
// delegate are retired (see docs/domain-model/approval-workflow.md).
const ROLES = [
  { code: "employee", displayName: "Employee" },
  { code: "manager", displayName: "Manager" },
  { code: "team-lead", displayName: "Team Lead" },
  { code: "finance-head", displayName: "Finance Head" },
  { code: "finance-reviewer", displayName: "Finance reviewer" },
  { code: "it-reviewer", displayName: "IT reviewer" },
  { code: "hr-administrator", displayName: "HR administrator" },
  { code: "hr", displayName: "HR" },
  { code: "superadmin", displayName: "Superadmin" },
];

const EMPLOYEE_ROLES = [
  { employeeId: "emp-grace", roleCode: "hr-administrator" },
  { employeeId: "emp-grace", roleCode: "hr" },
  { employeeId: "emp-shameel", roleCode: "employee" },
  { employeeId: "emp-ada", roleCode: "manager" },
  { employeeId: "emp-finance", roleCode: "finance-reviewer" },
  { employeeId: "emp-it", roleCode: "it-reviewer" },
  { employeeId: "emp-superadmin", roleCode: "superadmin" },
  { employeeId: "emp-abilash", roleCode: "team-lead" },
  { employeeId: "emp-sanil", roleCode: "manager" },
  { employeeId: "emp-arun", roleCode: "manager" },
  { employeeId: "emp-pramod", roleCode: "finance-head" },
  { employeeId: "emp-rishikesh", roleCode: "finance-reviewer" },
];

// Published (not draft) so submitClaim can resolve it for the "employee"
// role: only published Flows route new requests.
const FLOW = {
  name: "Standard reimbursement",
  targetRoleCode: "employee",
  steps: ["manager", "it-reviewer", "finance-reviewer"],
};

const CLAIMS = [
  {
    id: "claim-demo-draft",
    ref: "EXP-2026-0143",
    requesterId: "emp-shameel",
    title: "Team lunch - onboarding week",
    category: "Meals",
    subCategory: "Team Lunch/Dinner",
    remark: "Onboarding week team lunch",
    amountMinor: 21000,
    expenseDate: "2026-08-04",
    paymentMethod: "Personal card",
    status: "draft",
    currentStage: null,
    currentActorId: null,
    createdAt: "2026-08-04T11:05:00Z",
    submittedAt: null,
    steps: [],
    history: [{ id: "history-demo-draft", kind: "draft", actorId: "emp-shameel", detail: "Draft saved", createdAt: "2026-08-04T11:05:00Z" }],
  },
  {
    id: "claim-demo-approval",
    ref: "EXP-2026-0142",
    requesterId: "emp-shameel",
    title: "Figma Professional plan - H2 renewal",
    category: "Software",
    subCategory: "Software License & Subscription",
    remark: "Figma Professional plan renewal for H2",
    amountMinor: 59400,
    expenseDate: "2026-08-04",
    paymentMethod: "Company card",
    status: "in-approval",
    currentStage: "role-manager",
    currentActorId: "emp-ada",
    createdAt: "2026-08-03T10:42:00Z",
    submittedAt: "2026-08-03T10:42:00Z",
    steps: [
      ["step-demo-approval-manager", 0, "role-manager", "emp-ada", "pending"],
      ["step-demo-approval-it", 1, "role-it-reviewer", "emp-it", "pending"],
      ["step-demo-approval-finance", 2, "role-finance-reviewer", "emp-finance", "pending"],
    ],
    history: [
      { id: "history-demo-approval-draft", kind: "draft", actorId: "emp-shameel", detail: "Draft saved", createdAt: "2026-08-03T10:40:00Z" },
      { id: "history-demo-approval-submitted", kind: "submitted", actorId: "emp-shameel", detail: "Sent to Manager approval", createdAt: "2026-08-03T10:42:00Z" },
    ],
  },
  {
    id: "claim-demo-finance",
    ref: "EXP-2026-0132",
    requesterId: "emp-shameel",
    title: "Hotel - Karachi office week",
    category: "Lodging",
    subCategory: "Hotel Stay",
    remark: "Hotel for the Karachi office week",
    amountMinor: 62000,
    expenseDate: "2026-07-30",
    paymentMethod: "Personal card",
    status: "in-finance",
    currentStage: "role-finance-reviewer",
    currentActorId: "emp-finance",
    createdAt: "2026-07-26T08:55:00Z",
    submittedAt: "2026-07-26T08:55:00Z",
    accountNumber: "32534240620",
    ifscCode: "SBIN0012861",
    comments: "Awaiting invoice copy before payout",
    steps: [
      ["step-demo-finance-manager", 0, "role-manager", "emp-ada", "approved"],
      ["step-demo-finance-it", 1, "role-it-reviewer", "emp-it", "approved"],
      ["step-demo-finance-finance", 2, "role-finance-reviewer", "emp-finance", "pending"],
    ],
    history: [
      { id: "history-demo-finance-submitted", kind: "submitted", actorId: "emp-shameel", detail: "Sent for approval", createdAt: "2026-07-26T08:55:00Z" },
      { id: "history-demo-finance-manager", kind: "approved", actorId: "emp-ada", detail: "Manager approval", createdAt: "2026-07-27T10:00:00Z" },
      { id: "history-demo-finance-it", kind: "approved", actorId: "emp-it", detail: "IT review complete", createdAt: "2026-07-28T13:10:00Z" },
    ],
  },
  {
    id: "claim-demo-paid",
    ref: "EXP-2026-0126",
    requesterId: "emp-shameel",
    title: "Office snacks - pantry restock",
    category: "Supplies",
    subCategory: "Pantry",
    remark: "Pantry restock for the office",
    amountMinor: 9500,
    expenseDate: "2026-07-28",
    paymentMethod: "Company card",
    status: "paid",
    currentStage: null,
    currentActorId: null,
    createdAt: "2026-07-25T16:20:00Z",
    submittedAt: "2026-07-25T16:20:00Z",
    accountNumber: "32534240620",
    ifscCode: "SBIN0012861",
    comments: "Paid via NEFT on 30 Apr",
    steps: [
      ["step-demo-paid-manager", 0, "role-manager", "emp-ada", "approved"],
      ["step-demo-paid-it", 1, "role-it-reviewer", "emp-it", "approved"],
      ["step-demo-paid-finance", 2, "role-finance-reviewer", "emp-finance", "paid"],
    ],
    history: [
      { id: "history-demo-paid-submitted", kind: "submitted", actorId: "emp-shameel", detail: "Sent for approval", createdAt: "2026-07-25T16:20:00Z" },
      { id: "history-demo-paid-manager", kind: "approved", actorId: "emp-ada", detail: "Manager approval", createdAt: "2026-07-26T10:02:00Z" },
      { id: "history-demo-paid-it", kind: "approved", actorId: "emp-it", detail: "IT review complete", createdAt: "2026-07-26T13:05:00Z" },
      { id: "history-demo-paid-verified", kind: "verified", actorId: "emp-finance", detail: "Finance verified", createdAt: "2026-07-28T10:15:00Z" },
      { id: "history-demo-paid-paid", kind: "paid", actorId: "emp-finance", detail: "Payment marked complete", createdAt: "2026-07-28T12:15:00Z" },
    ],
  },
];

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "INSERT INTO organizations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [ORGANIZATION.id, ORGANIZATION.name],
    );

    for (const departmentName of DEPARTMENTS) {
      await client.query(
        `INSERT INTO departments (id, organization_id, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [`dept-${departmentName.toLowerCase()}`, ORGANIZATION.id, departmentName],
      );
    }

    for (const employee of EMPLOYEES) {
      const departmentId = `dept-${employee.department.toLowerCase()}`;
      await client.query(
        `INSERT INTO employees (id, organization_id, name, email, department_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, department_id = EXCLUDED.department_id`,
        [employee.id, ORGANIZATION.id, employee.name, employee.email, departmentId],
      );
    }

    for (const role of ROLES) {
      await client.query(
        `INSERT INTO roles (id, organization_id, code, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, code) DO UPDATE SET display_name = EXCLUDED.display_name`,
        [`role-${role.code}`, ORGANIZATION.id, role.code, role.displayName],
      );
    }

    await client.query(
      "DELETE FROM employee_roles WHERE employee_id IN (SELECT id FROM employees WHERE organization_id = $1)",
      [ORGANIZATION.id],
    );

    for (const assignment of EMPLOYEE_ROLES) {
      const roleResult = await client.query(
        "SELECT id FROM roles WHERE organization_id = $1 AND code = $2 LIMIT 1",
        [ORGANIZATION.id, assignment.roleCode],
      );
      if (roleResult.rows.length > 0) {
        const roleId = roleResult.rows[0].id;
        await client.query(
          `INSERT INTO employee_roles (employee_id, role_id) VALUES ($1, $2)
           ON CONFLICT (employee_id, role_id) DO NOTHING`,
          [assignment.employeeId, roleId],
        );
      }
    }

    const targetRoleRes = await client.query(
      "SELECT id FROM roles WHERE organization_id = $1 AND code = $2 LIMIT 1",
      [ORGANIZATION.id, FLOW.targetRoleCode],
    );
    const flowTargetRoleId = targetRoleRes.rows[0]?.id ?? `role-${FLOW.targetRoleCode}`;
    const existingFlow = await client.query(
      "SELECT id FROM flows WHERE name = $1 AND organization_id = $2 AND role_id = $3",
      [FLOW.name, ORGANIZATION.id, flowTargetRoleId],
    );
    let flowId = existingFlow.rows[0]?.id;
    if (!flowId) {
      const insertedFlow = await client.query(
        `INSERT INTO flows (id, organization_id, name, role_id, status)
         VALUES ($1, $2, $3, $4, 'published')
         RETURNING id`,
        [`flow-${crypto.randomUUID()}`, ORGANIZATION.id, FLOW.name, flowTargetRoleId],
      );
      flowId = insertedFlow.rows[0]?.id;
      if (flowId) {
        for (let index = 0; index < FLOW.steps.length; index += 1) {
          const stepRoleRes = await client.query(
            "SELECT id FROM roles WHERE organization_id = $1 AND code = $2 LIMIT 1",
            [ORGANIZATION.id, FLOW.steps[index]],
          );
          const stepRoleId = stepRoleRes.rows[0]?.id ?? `role-${FLOW.steps[index]}`;
          await client.query(
            "INSERT INTO flow_steps (flow_id, position, role_id) VALUES ($1, $2, $3)",
            [flowId, index, stepRoleId],
          );
        }
      }
    } else {
      const concurrentFlow = await client.query(
        "SELECT id FROM flows WHERE name = $1 AND organization_id = $2 AND role_id = $3",
        [FLOW.name, ORGANIZATION.id, flowTargetRoleId],
      );
      flowId = concurrentFlow.rows[0]?.id;
    }
    if (!flowId) {
      throw new Error("Could not create or find the seeded flow.");
    }

    await client.query(
      `INSERT INTO hierarchy_assignments (employee_id, manager_id)
       VALUES ($1, $2)
       ON CONFLICT (employee_id) DO UPDATE SET manager_id = EXCLUDED.manager_id, updated_at = now()`,
      ["emp-shameel", "emp-ada"],
    );

    for (const claim of CLAIMS) {
      await client.query(
        `INSERT INTO reimbursement_claims
          (id, organization_id, requester_id, reference, title, category, sub_category, remark, amount_minor, currency, expense_date, payment_method, status, current_stage, current_actor_id, current_stage_since, version, created_at, submitted_at, account_number, ifsc_code, comments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'INR', $10, $11, $12, $13, $14, $15, 1, $16, $17, $18, $19, $20)
         ON CONFLICT (id) DO UPDATE SET
           requester_id = EXCLUDED.requester_id, reference = EXCLUDED.reference, title = EXCLUDED.title,
           category = EXCLUDED.category, sub_category = EXCLUDED.sub_category, remark = EXCLUDED.remark,
           amount_minor = EXCLUDED.amount_minor, currency = EXCLUDED.currency,
           expense_date = EXCLUDED.expense_date, payment_method = EXCLUDED.payment_method, status = EXCLUDED.status,
           current_stage = EXCLUDED.current_stage, current_actor_id = EXCLUDED.current_actor_id,
           current_stage_since = EXCLUDED.current_stage_since,
           submitted_at = EXCLUDED.submitted_at, account_number = EXCLUDED.account_number, ifsc_code = EXCLUDED.ifsc_code,
           comments = EXCLUDED.comments, updated_at = now()`,
        [
          claim.id, ORGANIZATION.id, claim.requesterId, claim.ref, claim.title, claim.category, claim.subCategory ?? null, claim.remark ?? null,
          claim.amountMinor, claim.expenseDate, claim.paymentMethod, claim.status, claim.currentStage, claim.currentActorId,
          claim.currentStage ? claim.submittedAt : null, claim.createdAt, claim.submittedAt,
          claim.accountNumber ?? null, claim.ifscCode ?? null, claim.comments ?? null,
        ],
      );
      await client.query("DELETE FROM claim_approval_steps WHERE claim_id = $1", [claim.id]);
      for (const [id, position, roleId, assignedActorId, status] of claim.steps) {
        await client.query(
          `INSERT INTO claim_approval_steps (id, claim_id, position, role_id, assigned_actor_id, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, claim.id, position, roleId, assignedActorId, status],
        );
      }
      await client.query("DELETE FROM claim_history_events WHERE claim_id = $1", [claim.id]);
      for (const event of claim.history) {
        await client.query(
          `INSERT INTO claim_history_events (id, claim_id, kind, actor_id, detail, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [event.id, claim.id, event.kind, event.actorId, event.detail, event.createdAt],
        );
      }
    }

    await client.query("COMMIT");
    console.log(`seeded organization "${ORGANIZATION.name}" with ${EMPLOYEES.length} employees, ${ROLES.length} roles, and flow "${FLOW.name}"`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
