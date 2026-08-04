// Seeds the local admin foundation: organization, employees, roles, and a draft flow.
// Idempotent: safe to run repeatedly after migrations.
// Usage: npm run db:seed

import { Pool } from "pg";
import { databaseUrl } from "../src/server/db/connection.ts";

const ORGANIZATION = { id: "org-1", name: "Hive" };

const EMPLOYEES = [
  { id: "emp-ada", name: "Ada Lovelace", email: "ada@hive.local", department: "Engineering" },
  { id: "emp-grace", name: "Grace Hopper", email: "grace@hive.local", department: "Operations" },
  { id: "emp-katherine", name: "Katherine Johnson", email: "katherine@hive.local", department: "Engineering" },
  { id: "emp-dorothy", name: "Dorothy Vaughan", email: "dorothy@hive.local", department: "Finance" },
  { id: "emp-ceo", name: "CEO", email: "ceo@hive.local", department: "Executive" },
  { id: "emp-finance", name: "Finance Officer", email: "finance@hive.local", department: "Finance" },
  { id: "emp-it", name: "IT Head", email: "it@hive.local", department: "IT" },
  { id: "emp-shameel", name: "Muhammad Shameel", email: "muhammadshameelks@hive.local", department: "Engineering" },
];

const ROLES = [
  { code: "employee", displayName: "Employee" },
  { code: "manager", displayName: "Manager" },
  { code: "finance-reviewer", displayName: "Finance reviewer" },
  { code: "it-reviewer", displayName: "IT reviewer" },
  { code: "hr-administrator", displayName: "HR administrator" },
  { code: "system-administrator", displayName: "System administrator" },
  { code: "ceo-delegate", displayName: "CEO delegate" },
];

const EMPLOYEE_ROLES = [
  { employeeId: "emp-grace", roleCode: "hr-administrator" },
  { employeeId: "emp-shameel", roleCode: "system-administrator" },
  { employeeId: "emp-ada", roleCode: "manager" },
  { employeeId: "emp-dorothy", roleCode: "finance-reviewer" },
  { employeeId: "emp-it", roleCode: "it-reviewer" },
];

const FLOW = {
  name: "Standard reimbursement",
  scope: "All departments",
  steps: ["manager", "finance-reviewer", "ceo-delegate"],
};

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "INSERT INTO organizations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [ORGANIZATION.id, ORGANIZATION.name],
    );

    for (const employee of EMPLOYEES) {
      await client.query(
        `INSERT INTO employees (id, organization_id, name, email, department)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, department = EXCLUDED.department`,
        [employee.id, ORGANIZATION.id, employee.name, employee.email, employee.department],
      );
    }

    for (const role of ROLES) {
      await client.query(
        `INSERT INTO roles (id, organization_id, code, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
        [`role-${role.code}`, ORGANIZATION.id, role.code, role.displayName],
      );
    }

    for (const assignment of EMPLOYEE_ROLES) {
      const roleId = `role-${assignment.roleCode}`;
      await client.query(
        `INSERT INTO employee_roles (employee_id, role_id) VALUES ($1, $2)
         ON CONFLICT (employee_id, role_id) DO NOTHING`,
        [assignment.employeeId, roleId],
      );
    }

    const existingFlow = await client.query(
      "SELECT id FROM flows WHERE name = $1 AND organization_id = $2 AND scope = $3",
      [FLOW.name, ORGANIZATION.id, FLOW.scope],
    );
    let flowId = existingFlow.rows[0]?.id;
    if (!flowId) {
      flowId = `flow-${crypto.randomUUID()}`;
      await client.query(
        `INSERT INTO flows (id, organization_id, name, scope, status)
         VALUES ($1, $2, $3, $4, 'draft')`,
        [flowId, ORGANIZATION.id, FLOW.name, FLOW.scope],
      );
      for (let index = 0; index < FLOW.steps.length; index += 1) {
        await client.query(
          "INSERT INTO flow_steps (flow_id, position, role_id) VALUES ($1, $2, $3)",
          [flowId, index, `role-${FLOW.steps[index]}`],
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
