// Seeds the local expense foundation: organization, employees, roles, hierarchy, flow, and claims.
// Idempotent: safe to run repeatedly after migrations.
// Usage: npm run db:seed

import { Pool } from "pg";
import { databaseUrl } from "../src/server/db/connection.mjs";

const ORGANIZATION = { id: "org-1", name: "Hive" };

// Plain display names with no role embedded: the role lives on the
// assignment, not in the name.
const EMPLOYEES = [
  { id: "emp-superadmin", name: "Super Admin", email: "superadmin@hive.local", department: "Operations" },
  { id: "emp-shameel", name: "Muhammad Shameel", email: "muhammadshameelks@hive.local", department: "Engineering" },
  { id: "emp-katherine", name: "Katherine Johnson", email: "katherine@hive.local", department: "Engineering" },
  { id: "emp-ada", name: "Ada Lovelace", email: "ada@hive.local", department: "Engineering" },
  { id: "emp-sanil", name: "Sanil Davis", email: "sanil@hive.local", department: "Engineering" },
  { id: "emp-arun", name: "Arun Kumar", email: "arun@hive.local", department: "Operations" },
  { id: "emp-dorothy", name: "Dorothy Vaughan", email: "dorothy@hive.local", department: "Operations" },
  { id: "emp-abilash", name: "Abilash", email: "abilash@hive.local", department: "Engineering" },
  { id: "emp-intern", name: "Ananya Iyer", email: "ananya@hive.local", department: "Engineering" },
  { id: "emp-pramod", name: "Pramod", email: "pramod@hive.local", department: "Finance" },
  { id: "emp-finance", name: "Rishikesh", email: "finance@hive.local", department: "Finance" },
  { id: "emp-rishikesh", name: "Farhan", email: "rishikesh@hive.local", department: "Finance" },
];

const DEPARTMENTS = ["Engineering", "Operations", "Finance"];

// The five locked predefined roles (intern, executive, manager,
// finance-head, finance-executive) plus the built-in Superadmin role are
// seeded locked: they cannot be deactivated through the console. Team Lead
// is a custom, org-wide role (locked = false) usable as an approval step
// target, e.g. as the named team-lead step of an intern flow (slice 4).
const ROLES = [
  { code: "intern", displayName: "Intern", locked: true },
  { code: "executive", displayName: "Executive", locked: true },
  { code: "manager", displayName: "Manager", locked: true },
  { code: "finance-head", displayName: "Finance Head", locked: true },
  { code: "finance-executive", displayName: "Finance Executive", locked: true },
  { code: "team-lead", displayName: "Team Lead", locked: false },
  { code: "superadmin", displayName: "Superadmin", locked: true },
];

const EMPLOYEE_ROLES = [
  { employeeId: "emp-superadmin", roleCode: "superadmin" },
  { employeeId: "emp-shameel", roleCode: "executive" },
  { employeeId: "emp-katherine", roleCode: "executive" },
  { employeeId: "emp-ada", roleCode: "manager" },
  { employeeId: "emp-sanil", roleCode: "manager" },
  { employeeId: "emp-arun", roleCode: "manager" },
  { employeeId: "emp-dorothy", roleCode: "manager" },
  { employeeId: "emp-abilash", roleCode: "team-lead" },
  { employeeId: "emp-intern", roleCode: "intern" },
  { employeeId: "emp-pramod", roleCode: "finance-head" },
  { employeeId: "emp-finance", roleCode: "finance-executive" },
  { employeeId: "emp-rishikesh", roleCode: "finance-executive" },
];

// Published (not draft) so submitClaim can resolve them for the "executive"
// and "intern" roles: only published Flows route new requests. The Manager
// step resolves to Manager-role holders in the requester's department
// (routing slice); the Finance Head and Finance Executive steps are
// org-wide, and Finance Executive is the required terminal
// verification-and-payment stage. The intern flow's first step is a
// named-person team-lead target: it resolves to the intern's assigned
// hierarchy manager (emp-abilash) at submission, not to a role.
const FLOWS = [
  {
    name: "Standard reimbursement",
    targetRoleCode: "executive",
    steps: [
      { kind: "role", roleCode: "manager" },
      { kind: "role", roleCode: "finance-head" },
      { kind: "role", roleCode: "finance-executive" },
    ],
  },
  {
    name: "Intern reimbursement",
    targetRoleCode: "intern",
    steps: [
      { kind: "team-lead" },
      { kind: "role", roleCode: "manager" },
      { kind: "role", roleCode: "finance-head" },
      { kind: "role", roleCode: "finance-executive" },
    ],
  },
];

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
    status: "in-approval",
    currentStage: "role-manager",
    currentActorId: "emp-ada",
    createdAt: "2026-08-03T10:42:00Z",
    submittedAt: "2026-08-03T10:42:00Z",
    steps: [
      ["step-demo-approval-manager", 0, "manager", "emp-ada", "pending"],
      ["step-demo-approval-finance-head", 1, "finance-head", "emp-pramod", "pending"],
      ["step-demo-approval-finance-executive", 2, "finance-executive", "emp-finance", "pending"],
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
    status: "in-finance",
    currentStage: "role-finance-executive",
    currentActorId: "emp-finance",
    createdAt: "2026-07-26T08:55:00Z",
    submittedAt: "2026-07-26T08:55:00Z",
    accountNumber: "32534240620",
    ifscCode: "SBIN0012861",
    comments: "Awaiting invoice copy before payout",
    steps: [
      ["step-demo-finance-manager", 0, "manager", "emp-ada", "approved"],
      ["step-demo-finance-finance-head", 1, "finance-head", "emp-pramod", "approved"],
      ["step-demo-finance-finance-executive", 2, "finance-executive", "emp-finance", "pending"],
    ],
    history: [
      { id: "history-demo-finance-submitted", kind: "submitted", actorId: "emp-shameel", detail: "Sent for approval", createdAt: "2026-07-26T08:55:00Z" },
      { id: "history-demo-finance-manager", kind: "approved", actorId: "emp-ada", detail: "Manager approval", createdAt: "2026-07-27T10:00:00Z" },
      { id: "history-demo-finance-finance-head", kind: "approved", actorId: "emp-pramod", detail: "Finance Head review complete", createdAt: "2026-07-28T13:10:00Z" },
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
    status: "paid",
    currentStage: null,
    currentActorId: null,
    createdAt: "2026-07-25T16:20:00Z",
    submittedAt: "2026-07-25T16:20:00Z",
    accountNumber: "32534240620",
    ifscCode: "SBIN0012861",
    comments: "Paid via NEFT on 30 Apr",
    steps: [
      ["step-demo-paid-manager", 0, "manager", "emp-ada", "approved"],
      ["step-demo-paid-finance-head", 1, "finance-head", "emp-pramod", "approved"],
      ["step-demo-paid-finance-executive", 2, "finance-executive", "emp-finance", "paid"],
    ],
    history: [
      { id: "history-demo-paid-submitted", kind: "submitted", actorId: "emp-shameel", detail: "Sent for approval", createdAt: "2026-07-25T16:20:00Z" },
      { id: "history-demo-paid-manager", kind: "approved", actorId: "emp-ada", detail: "Manager approval", createdAt: "2026-07-26T10:02:00Z" },
      { id: "history-demo-paid-finance-head", kind: "approved", actorId: "emp-pramod", detail: "Finance Head review complete", createdAt: "2026-07-26T13:05:00Z" },
      { id: "history-demo-paid-verified", kind: "verified", actorId: "emp-finance", detail: "Finance verified", createdAt: "2026-07-28T10:15:00Z" },
      { id: "history-demo-paid-paid", kind: "paid", actorId: "emp-finance", detail: "Payment marked complete", createdAt: "2026-07-28T12:15:00Z" },
    ],
  },
];

const HIERARCHY = [
  // emp-shameel reports to emp-ada.
  // The intern's named team lead is emp-abilash: slice 4 consumes this
  // hierarchy entry as the named-person team-lead step target of the intern
  // flow.
  ["emp-shameel", "emp-ada"],
  ["emp-intern", "emp-abilash"],
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
        `INSERT INTO roles (id, organization_id, code, display_name, locked)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, code) DO UPDATE SET display_name = EXCLUDED.display_name, locked = EXCLUDED.locked`,
        [`role-${role.code}`, ORGANIZATION.id, role.code, role.displayName, role.locked],
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

    for (const flow of FLOWS) {
      const targetRoleRes = await client.query(
        "SELECT id FROM roles WHERE organization_id = $1 AND code = $2 LIMIT 1",
        [ORGANIZATION.id, flow.targetRoleCode],
      );
      const flowTargetRoleId = targetRoleRes.rows[0]?.id ?? `role-${flow.targetRoleCode}`;
      const existingFlow = await client.query(
        "SELECT id FROM flows WHERE name = $1 AND organization_id = $2 AND role_id = $3",
        [flow.name, ORGANIZATION.id, flowTargetRoleId],
      );
      let flowId = existingFlow.rows[0]?.id;
      if (!flowId) {
        const insertedFlow = await client.query(
          `INSERT INTO flows (id, organization_id, name, role_id, status)
           VALUES ($1, $2, $3, $4, 'published')
           RETURNING id`,
          [`flow-${crypto.randomUUID()}`, ORGANIZATION.id, flow.name, flowTargetRoleId],
        );
        flowId = insertedFlow.rows[0]?.id;
        if (flowId) {
          for (let index = 0; index < flow.steps.length; index += 1) {
            const step = flow.steps[index];
            let stepRoleId = null;
            if (step.kind === "role") {
              const stepRoleRes = await client.query(
                "SELECT id FROM roles WHERE organization_id = $1 AND code = $2 LIMIT 1",
                [ORGANIZATION.id, step.roleCode],
              );
              stepRoleId = stepRoleRes.rows[0]?.id ?? `role-${step.roleCode}`;
            }
            await client.query(
              "INSERT INTO flow_steps (flow_id, position, kind, role_id) VALUES ($1, $2, $3, $4)",
              [flowId, index, step.kind, stepRoleId],
            );
          }
        }
      } else {
        const concurrentFlow = await client.query(
          "SELECT id FROM flows WHERE name = $1 AND organization_id = $2 AND role_id = $3",
          [flow.name, ORGANIZATION.id, flowTargetRoleId],
        );
        flowId = concurrentFlow.rows[0]?.id;
      }
      if (!flowId) {
        throw new Error("Could not create or find the seeded flow.");
      }
    }

    for (const [employeeId, managerId] of HIERARCHY) {
      await client.query(
        `INSERT INTO hierarchy_assignments (employee_id, manager_id)
         VALUES ($1, $2)
         ON CONFLICT (employee_id) DO UPDATE SET manager_id = EXCLUDED.manager_id, updated_at = now()`,
        [employeeId, managerId],
      );
    }

    for (const claim of CLAIMS) {
      await client.query(
        `INSERT INTO reimbursement_claims
          (id, organization_id, requester_id, reference, title, category, sub_category, remark, amount_minor, currency, expense_date, status, current_stage, current_actor_id, current_stage_since, version, created_at, submitted_at, account_number, ifsc_code, comments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'INR', $10, $11, $12, $13, $14, 1, $15, $16, $17, $18, $19)
         ON CONFLICT (id) DO UPDATE SET
           requester_id = EXCLUDED.requester_id, reference = EXCLUDED.reference, title = EXCLUDED.title,
           category = EXCLUDED.category, sub_category = EXCLUDED.sub_category, remark = EXCLUDED.remark,
           amount_minor = EXCLUDED.amount_minor, currency = EXCLUDED.currency,
           expense_date = EXCLUDED.expense_date, status = EXCLUDED.status,
           current_stage = EXCLUDED.current_stage, current_actor_id = EXCLUDED.current_actor_id,
           current_stage_since = EXCLUDED.current_stage_since,
           submitted_at = EXCLUDED.submitted_at, account_number = EXCLUDED.account_number, ifsc_code = EXCLUDED.ifsc_code,
           comments = EXCLUDED.comments, updated_at = now()`,
        [
          claim.id, ORGANIZATION.id, claim.requesterId, claim.ref, claim.title, claim.category, claim.subCategory ?? null, claim.remark ?? null,
          claim.amountMinor, claim.expenseDate, claim.status, claim.currentStage, claim.currentActorId,
          claim.currentStage ? claim.submittedAt : null, claim.createdAt, claim.submittedAt,
          claim.accountNumber ?? null, claim.ifscCode ?? null, claim.comments ?? null,
        ],
      );
      await client.query("DELETE FROM claim_approval_steps WHERE claim_id = $1", [claim.id]);
      for (const [id, position, roleCode, assignedActorId, status] of claim.steps) {
        const roleRes = await client.query(
          "SELECT id FROM roles WHERE organization_id = $1 AND code = $2 LIMIT 1",
          [ORGANIZATION.id, roleCode],
        );
        const roleId = roleRes.rows[0]?.id ?? `role-${roleCode}`;
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

    // Retire roles from the pre-rewrite vocabulary (employee, hr,
    // it-reviewer, finance-reviewer, ceo) that an earlier seed run left
    // behind, together with their flow and claim-step references. Roles
    // whose code is in the seed list are updated in place, so a
    // console-created role with a seeded code (e.g. finance-head) keeps
    // its id and remains intact.
    const seededCodes = ROLES.map((role) => role.code);
    await client.query(
      `DELETE FROM claim_approval_steps
       WHERE role_id IN (SELECT id FROM roles WHERE organization_id = $1 AND code != ALL($2::text[]))`,
      [ORGANIZATION.id, seededCodes],
    );
    await client.query(
      `DELETE FROM flow_steps
       WHERE role_id IN (SELECT id FROM roles WHERE organization_id = $1 AND code != ALL($2::text[]))`,
      [ORGANIZATION.id, seededCodes],
    );
    await client.query(
      `DELETE FROM flows
       WHERE role_id IN (SELECT id FROM roles WHERE organization_id = $1 AND code != ALL($2::text[]))`,
      [ORGANIZATION.id, seededCodes],
    );
    await client.query(
      `DELETE FROM roles WHERE organization_id = $1 AND code != ALL($2::text[])`,
      [ORGANIZATION.id, seededCodes],
    );

    await client.query("COMMIT");
    console.log(`seeded organization "${ORGANIZATION.name}" with ${EMPLOYEES.length} employees, ${ROLES.length} roles, and ${FLOWS.length} published flows`);
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
