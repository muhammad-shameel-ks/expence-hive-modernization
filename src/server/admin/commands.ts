import {
  ACTION_PRIVILEGE_LABELS,
  removedActionPrivileges,
  resolveRoleCapabilities,
  SUPERADMIN_ROLE_CODE,
  MANAGER_ROLE_CODE,
  FINANCE_EXECUTIVE_ROLE_CODE,
  type ActionPrivilege,
  type RoleCapabilities,
} from "../shared/authorization";
import { MAX_ABSENCE_TIMEOUT_DAYS } from "../shared/absence-timeout";
import type { ExpenseStore } from "../expenses/ports";
import { isTerminalIndex } from "../expenses/absence-skip";
import { parseRosterCsv } from "./roster-csv";
import {
  type AdminDepartment,
  type AdminEmployee,
  type AdminRole,
  type AdminStore,
  type AuditEvent,
  type AuditFilter,
  type DepartmentInput,
  type EmployeeCreateInput,
  type FlowDraft,
  type FlowInput,
  type FlowStepInput,
  type RoleInput,
} from "./ports";

export type AdminErrorCode =
  | "unauthorized"
  | "validation"
  | "not-found"
  | "locked"
  | "conflict";

const ADMIN_ERROR_CODES = [
  "unauthorized",
  "validation",
  "not-found",
  "locked",
  "conflict",
] as const;

export class AdminError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
    // The pending-claim impact carried by the conflict a role-privilege
    // removal raises when the caller has not confirmed it (ADR-0015). The
    // HTTP boundary serializes it so the console can render the warning
    // dialog from the rejection alone.
    readonly impact?: RoleCapabilityImpact,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

function isManagerRole(role?: { code?: string } | null): boolean {
  return role?.code === MANAGER_ROLE_CODE;
}

// The pending-claim impact of a privilege change (ADR-0015): which action
// privileges would be removed, and the in-flight claims with a pending step
// at the role - ref and title plus the requester and stage for the console
// warning dialog. willSkip is false for a claim pending at the terminal
// step: the absence sweep never auto-skips the terminal step, so losing the
// role's action privilege there strands the claim rather than advancing it.
export type PendingRoleStepClaim = {
  ref: string;
  title: string;
  requesterId: string;
  requesterName: string;
  stage: string;
  willSkip: boolean;
};

export type RoleCapabilityImpact = {
  removedActionPrivileges: ActionPrivilege[];
  pendingClaims: PendingRoleStepClaim[];
};

export function isAdminError(error: unknown): error is AdminError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    (ADMIN_ERROR_CODES as readonly string[]).includes((error as { code: string }).code)
  );
}

// Roster rows name roles by code (stable) or display name (what people
// actually read), matched case-insensitively. Inactive roles are never
// matched: the roster can only target active roles.
function resolveRoleFromRoster(
  activeRoles: AdminRole[],
  text: string,
): AdminRole | null {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  return (
    activeRoles.find((role) => role.code.toLowerCase() === needle) ??
    activeRoles.find((role) => role.displayName.toLowerCase() === needle) ??
    null
  );
}

function resolveDepartmentFromRoster(
  activeDepartments: AdminDepartment[],
  text: string,
): AdminDepartment | null {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  return (
    activeDepartments.find((department) => department.name.toLowerCase() === needle) ?? null
  );
}

const MAX_NAME_LENGTH = 120;
const MAX_CODE_LENGTH = 60;
const MAX_FLOW_STEPS = 15;
const MAX_EMPLOYEE_ID_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

// A deliberately pragmatic shape check: the identity provider and seeds use
// plain company addresses, and the store is the authoritative uniqueness
// guard. Anything with a local part, an @, and a dotted domain is accepted.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// The four amount guard operators, read as "this step runs only when the
// claim total satisfies the operator against the guard amount".
const GUARD_OPERATORS = ["gte", "gt", "lte", "lt"] as const;

// The six toggles are the fixed privilege catalog (ADR-0015, amended by
// ADR-0024 and ADR-0026): a capability set must carry all six as booleans.
// The HTTP boundary shapes the body into this shape; the commands
// re-validate it so stores never see partial sets.
const CAPABILITY_KEYS = [
  "canSubmit",
  "canApprove",
  "canAccessFinance",
  "approveBankDetails",
  "canViewOrganizationActivity",
  "canAccessAdminConsole",
] as const;

export function parseRoleCapabilities(value: unknown): RoleCapabilities | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const capabilities = {} as RoleCapabilities;
  for (const key of CAPABILITY_KEYS) {
    if (typeof candidate[key] !== "boolean") return null;
    capabilities[key] = candidate[key];
  }
  return capabilities;
}

export type AdminCommands = {
  listEmployees(actorId: string): Promise<AdminEmployee[]>;
  listFlows(actorId: string): Promise<FlowDraft[]>;
  getAdminActor(actorId: string): Promise<AdminEmployee | null>;
  listAuditEvents(
    actorId: string,
    filter: AuditFilter,
    pagination?: { page?: number; pageSize?: number },
  ): Promise<{ events: AuditEvent[]; total: number }>;
  assignRole(actorId: string, input: { employeeId: string; roleId: string }): Promise<void>;
  assignDepartment(actorId: string, input: { employeeId: string; departmentId: string }): Promise<void>;
  deactivateEmployee(actorId: string, employeeId: string): Promise<void>;
  reactivateEmployee(actorId: string, employeeId: string): Promise<void>;
  assignManager(actorId: string, input: { employeeId: string; managerId: string | null }): Promise<void>;
  createEmployee(actorId: string, input: CreateEmployeeInput): Promise<AdminEmployee>;
  importEmployees(actorId: string, input: { csv: string }): Promise<RosterImportResult>;
  listDepartments(actorId: string): Promise<AdminDepartment[]>;
  createDepartment(actorId: string, input: DepartmentInput): Promise<AdminDepartment>;
  setDepartmentHead(actorId: string, input: { departmentId: string; headId: string }): Promise<void>;
  deactivateDepartment(actorId: string, departmentId: string): Promise<void>;
  listRoles(actorId: string): Promise<AdminRole[]>;
  createRole(actorId: string, input: RoleInput): Promise<AdminRole>;
  deactivateRole(actorId: string, roleId: string): Promise<void>;
  // Applies a new capability set to a role. Removing an action privilege
  // (approve / finance access) while claims are pending at the
  // role's steps requires the caller's confirmation; unconfirmed, the
  // command raises a conflict carrying the full impact. Confirmed removals
  // sweep the affected pending steps forward on the next absence catch-up,
  // so the response also reports the pending claims that will skip.
  updateRoleCapabilities(
    actorId: string,
    roleId: string,
    capabilities: RoleCapabilities,
    options?: { confirmed?: boolean },
  ): Promise<{ role: AdminRole; pendingClaims: PendingRoleStepClaim[] }>;
  createFlow(actorId: string, input: FlowInput): Promise<FlowDraft>;
  updateFlow(actorId: string, flowId: string, input: FlowInput): Promise<FlowDraft>;
  publishFlow(actorId: string, flowId: string): Promise<FlowDraft>;
  deleteFlow(actorId: string, flowId: string): Promise<void>;
  getAbsenceTimeoutDays(actorId: string): Promise<number>;
  setAbsenceTimeoutDays(actorId: string, days: number): Promise<void>;
};

// Admin-created employees are fully specified up front: the manager
// auto-defaults to the department head when omitted, and may be overridden
// in the same request.
export type CreateEmployeeInput = {
  name: string;
  email: string;
  roleId: string;
  departmentId: string;
  managerId?: string | null;
};

// All-or-nothing roster import: either every row is written or none is.
// The result carries per-row outcomes so the console can show exactly which
// rows failed and why. A created row carries the full employee payload so
// the console can append it to the people list without a reload.
export type RosterImportRowResult = {
  rowNumber: number;
  email: string;
  status: "created" | "failed";
  error?: string;
  employee?: AdminEmployee;
};

export type RosterImportResult = {
  total: number;
  created: RosterImportRowResult[];
  failed: RosterImportRowResult[];
};

export function createAdminCommands({
  store,
  expensesStore,
  now = () => new Date(),
}: {
  store: AdminStore;
  // The expense side of the role-privilege impact (ADR-0015): claims
  // pending at a role's steps live in the reimbursement claims store.
  expensesStore: ExpenseStore;
  now?: () => Date;
}): AdminCommands {
  async function requireAdmin(actorId: string): Promise<AdminEmployee> {
    const actor = await getAdminActor(actorId);
    if (!actor) {
      throw new AdminError("unauthorized", "Only Superadmin can use the admin workspace.");
    }
    return actor;
  }

  // Company auto-skip configuration is a Superadmin-only built-in
  // (ADR-0015/ADR-0018), never gated by the admin-console toggle. The
  // message names both directions so it fits the read path too.
  async function requireSuperadmin(actorId: string): Promise<AdminEmployee> {
    const actor = await store.getEmployee(actorId);
    if (!actor || actor.role?.code !== SUPERADMIN_ROLE_CODE) {
      throw new AdminError("unauthorized", "Only Superadmin can view or change the absence timeout.");
    }
    return actor;
  }

  function getAdminActor(actorId: string): Promise<AdminEmployee | null> {
    return store.getEmployee(actorId).then((actor) =>
      actor !== null &&
      actor.role !== null &&
      resolveRoleCapabilities(actor.role).canAccessAdminConsole
        ? actor
        : null,
    );
  }

  async function requireActiveRole(organizationId: string, roleId: string): Promise<AdminRole> {
    const role = await store.getRole(roleId);
    if (!role || role.organizationId !== organizationId) {
      throw new AdminError("validation", `Unknown role "${roleId}".`);
    }
    if (!role.active) {
      throw new AdminError("validation", `Role "${role.displayName}" is not active.`);
    }
    return role;
  }

  async function resolveEmployeeInOrg(
    organizationId: string,
    employeeId: string,
  ): Promise<AdminEmployee> {
    if (employeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
      throw new AdminError("validation", "Employee id is too long.");
    }
    const target = await store.getEmployee(employeeId);
    if (!target || target.organizationId !== organizationId) {
      throw new AdminError("not-found", "Employee does not exist.");
    }
    return target;
  }

  async function audit(actor: AdminEmployee, action: string, detail: string): Promise<void> {
    await store.appendAudit(actor.organizationId, {
      id: `audit-${crypto.randomUUID()}`,
      organizationId: actor.organizationId,
      actorId: actor.id,
      action,
      detail,
      createdAt: now(),
    });
  }

  // Claims with a pending step at the role: these are the claims a
  // privilege removal would affect - the step can no longer be acted on,
  // so the absence catch-up sweeps it forward (ADR-0015). A claim counts
  // once, at its earliest pending step targeting the role, and the stage
  // label is the role's display name.
  async function pendingClaimsAtRoleSteps(
    organizationId: string,
    roleId: string,
    stage: string,
  ): Promise<PendingRoleStepClaim[]> {
    const [claims, employees] = await Promise.all([
      expensesStore.listClaimsForOrganization(organizationId),
      expensesStore.listEmployees(organizationId),
    ]);
    const requesterNames = new Map(employees.map((employee) => [employee.id, employee.name]));
    const pending: PendingRoleStepClaim[] = [];
    for (const claim of claims) {
      if (claim.status !== "in-approval" && claim.status !== "in-finance") continue;
      const stepIndex = claim.steps.findIndex(
        (candidate) => candidate.status === "pending" && candidate.roleId === roleId,
      );
      if (stepIndex === -1) continue;
      pending.push({
        ref: claim.ref,
        title: claim.title,
        requesterId: claim.requesterId,
        requesterName: requesterNames.get(claim.requesterId) ?? claim.requesterId,
        stage,
        willSkip: !isTerminalIndex(claim, stepIndex),
      });
    }
    return pending;
  }

  // Flow steps target either a role (existing, active, org-wide) or the
  // requester's assigned team lead. A team-lead step must not carry a role
  // id and a role step must carry one; anything else is malformed input.
  // A step may carry an amount guard (operator + positive paise amount),
  // except the terminal step: the runtime never auto-skips it, so a guard
  // there would silently strand claims.
  async function validateFlowSteps(organizationId: string, steps: FlowStepInput[]): Promise<void> {
    if (steps.length === 0) {
      throw new AdminError("validation", "Flow needs at least one step.");
    }
    if (steps.length > MAX_FLOW_STEPS) {
      throw new AdminError("validation", "Flow cannot have more than 15 steps.");
    }
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (step.kind === "team-lead") {
        if ("roleId" in step) {
          throw new AdminError("validation", "A team lead step cannot carry a role id.");
        }
      } else {
        if (step.kind !== "role") {
          throw new AdminError("validation", "A flow step must target a role or a team lead.");
        }
        await requireActiveRole(organizationId, step.roleId);
      }
      if (step.guard !== null && step.guard !== undefined) {
        if (index === steps.length - 1) {
          throw new AdminError("validation", "The terminal step of a flow cannot be guarded.");
        }
        if (!GUARD_OPERATORS.includes(step.guard.operator)) {
          throw new AdminError("validation", `Unknown guard operator "${step.guard.operator}".`);
        }
        if (!Number.isInteger(step.guard.amountMinor) || step.guard.amountMinor <= 0) {
          throw new AdminError("validation", "The guard amount must be a positive integer (paise).");
        }
      }
    }
  }

  return {
    getAdminActor,

    async listEmployees(actorId) {
      const actor = await requireAdmin(actorId);
      return store.listEmployees(actor.organizationId);
    },

    async listFlows(actorId) {
      const actor = await requireAdmin(actorId);
      return store.listFlows(actor.organizationId);
    },

    async listAuditEvents(actorId, filter, pagination) {
      const actor = await requireAdmin(actorId);
      const page = Math.max(1, Math.floor(pagination?.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Math.floor(pagination?.pageSize ?? 50)));
      return store.listAuditEvents(actor.organizationId, filter, { page, pageSize });
    },

    async assignRole(actorId, { employeeId, roleId }) {
      const actor = await requireAdmin(actorId);
      if (employeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
        throw new AdminError("validation", "Employee id is too long.");
      }
      const target = await store.getEmployee(employeeId);
      if (!target || target.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Employee does not exist.");
      }
      const role = await requireActiveRole(actor.organizationId, roleId);
      if (target.role?.id === role.id) {
        return;
      }
      await store.setEmployeeRole(employeeId, role.id);
      if (target.departmentId && isManagerRole(role)) {
        const departments = await store.listDepartments(actor.organizationId);
        const dept = departments.find((candidate) => candidate.id === target.departmentId);
        if (dept && !dept.headId) {
          await store.setDepartmentHead(dept.id, employeeId);
        }
      }
      await audit(actor, "assign-role", `${target.name} assigned to the ${role.displayName} role.`);
    },

    async assignDepartment(actorId, { employeeId, departmentId }) {
      const actor = await requireAdmin(actorId);
      if (employeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
        throw new AdminError("validation", "Employee id is too long.");
      }
      const target = await store.getEmployee(employeeId);
      if (!target || target.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Employee does not exist.");
      }
      const department = (await store.listDepartments(actor.organizationId)).find(
        (dept) => dept.id === departmentId && dept.active,
      );
      if (!department) {
        throw new AdminError("not-found", "Department does not exist or is inactive.");
      }
      // The no-op guard compares the department id only: the stored
      // department name is snapshotted at assignment time, so comparing it
      // here would spuriously re-assign (and audit) after a rename.
      if (target.departmentId === department.id) {
        return;
      }
      await store.setEmployeeDepartment(employeeId, department.id);
      if (!department.headId && isManagerRole(target.role)) {
        await store.setDepartmentHead(department.id, employeeId);
      }
      await audit(actor, "assign-department", `${target.name} moved to the ${department.name} department.`);
    },

    async deactivateEmployee(actorId, employeeId) {
      const actor = await requireAdmin(actorId);
      const target = await resolveEmployeeInOrg(actor.organizationId, employeeId);
      if (actor.id === employeeId) {
        throw new AdminError("conflict", "You cannot deactivate your own account.");
      }
      if (target.role?.code === SUPERADMIN_ROLE_CODE) {
        const employees = await store.listEmployees(actor.organizationId);
        const otherActiveSuperadmins = employees.filter(
          (employee) =>
            employee.id !== employeeId &&
            employee.active &&
            employee.role?.code === SUPERADMIN_ROLE_CODE,
        );
        if (otherActiveSuperadmins.length === 0) {
          throw new AdminError("conflict", "The last active Superadmin cannot be deactivated.");
        }
      }
      await store.setEmployeeActive(employeeId, false);
      await audit(actor, "deactivate-employee", `${target.name} deactivated.`);
    },

    async reactivateEmployee(actorId, employeeId) {
      const actor = await requireAdmin(actorId);
      const target = await resolveEmployeeInOrg(actor.organizationId, employeeId);
      await store.setEmployeeActive(employeeId, true);
      await audit(actor, "reactivate-employee", `${target.name} reactivated.`);
    },

    async assignManager(actorId, { employeeId, managerId }) {
      const actor = await requireAdmin(actorId);
      const target = await resolveEmployeeInOrg(actor.organizationId, employeeId);
      if (managerId === null) {
        if (target.managerId === null) {
          return;
        }
        await store.setEmployeeManager(employeeId, null);
        await audit(actor, "assign-manager", `Cleared ${target.name}'s manager assignment.`);
        return;
      }
      if (managerId === employeeId) {
        throw new AdminError("validation", "An employee cannot be their own manager.");
      }
      if (managerId.length > MAX_EMPLOYEE_ID_LENGTH) {
        throw new AdminError("validation", "Employee id is too long.");
      }
      const manager = await store.getEmployee(managerId);
      if (!manager || manager.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Manager does not exist.");
      }
      if (!manager.active) {
        throw new AdminError("validation", "A deactivated employee cannot be a manager.");
      }
      if (target.managerId === manager.id) {
        return;
      }
      await store.setEmployeeManager(employeeId, manager.id);
      await audit(actor, "assign-manager", `${target.name} now reports to ${manager.name}.`);
    },

    async createEmployee(actorId, input: CreateEmployeeInput) {
      const actor = await requireAdmin(actorId);
      const name = input.name.trim();
      if (!name) {
        throw new AdminError("validation", "Employee needs a name.");
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Employee name is too long (max 120 characters).");
      }
      const email = normalizeEmail(input.email);
      if (!EMAIL_PATTERN.test(email)) {
        throw new AdminError("validation", `"${input.email}" is not a valid email address.`);
      }
      if (email.length > MAX_EMAIL_LENGTH) {
        throw new AdminError("validation", "Employee email is too long.");
      }
      const existing = await store.findEmployeeByEmail(actor.organizationId, email);
      if (existing) {
        throw new AdminError("validation", `An employee with email "${email}" already exists.`);
      }
      const role = await requireActiveRole(actor.organizationId, input.roleId);
      const departments = await store.listDepartments(actor.organizationId);
      const department = departments.find(
        (candidate) => candidate.id === input.departmentId && candidate.active,
      );
      if (!department) {
        throw new AdminError("not-found", "Department does not exist or is inactive.");
      }
      // The single-user manager is always the department head (ADR-0019):
      // the bulk-import CSV is the one path that accepts an explicit
      // manager override. The head is required, so a headless department
      // blocks creation until a head is assigned.
      const headId = department.head?.id ?? null;
      if (headId === null) {
        throw new AdminError(
          "validation",
          `The "${department.name}" department has no head; assign one before creating members.`,
        );
      }
      if (
        input.managerId !== undefined &&
        input.managerId !== null &&
        input.managerId !== headId
      ) {
        throw new AdminError(
          "validation",
          "The manager is always the department head when creating a single user.",
        );
      }
      const managerId = headId;
      const manager = await store.getEmployee(managerId);
      if (!manager || manager.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Manager does not exist.");
      }
      if (!manager.active) {
        throw new AdminError("validation", "A deactivated employee cannot be a manager.");
      }
      const id = `emp-${crypto.randomUUID().slice(0, 8)}`;
      await store.createEmployee(actor.organizationId, { id, name, email });
      await store.setEmployeeRole(id, role.id);
      await store.setEmployeeDepartment(id, department.id);
      await store.setEmployeeManager(id, manager.id);
      await audit(
        actor,
        "create-employee",
        `${name} created with the ${role.displayName} role in the ${department.name} department.`,
      );
      const created = await store.getEmployee(id);
      if (!created) {
        throw new AdminError("not-found", "Employee does not exist.");
      }
      return created;
    },

    async importEmployees(actorId, { csv }) {
      const actor = await requireAdmin(actorId);
      const parsed = parseRosterCsv(csv);
      // Whole-file problems (missing or unknown header, unterminated quote)
      // always carry rowNumber 1: the file is not a roster at all, so it is
      // rejected outright. Anything else is a per-row problem.
      const fileLevelError = parsed.errors.find((error) => error.rowNumber === 1);
      if (fileLevelError) {
        throw new AdminError("validation", fileLevelError.error);
      }
      const failed: RosterImportRowResult[] = parsed.errors.map((error) => ({
        rowNumber: error.rowNumber,
        email: "",
        status: "failed",
        error: error.error,
      }));
      const [employees, roles, departments] = await Promise.all([
        store.listEmployees(actor.organizationId),
        store.listRoles(actor.organizationId),
        store.listDepartments(actor.organizationId),
      ]);
      const employeeByEmail = new Map(employees.map((person) => [person.email, person]));
      const employeeById = new Map(employees.map((person) => [person.id, person]));
      const existingEmails = new Set(employees.map((person) => person.email));
      const activeRoles = roles.filter((role) => role.active);
      const activeDepartments = departments.filter((department) => department.active);

      const resolved: Array<{
        rowNumber: number;
        input: EmployeeCreateInput;
        role: AdminRole;
        department: AdminDepartment;
      }> = [];
      const seenEmails = new Set<string>();
      for (const row of parsed.rows) {
        const rowErrors: string[] = [];
        const name = row.fields.name;
        if (!name) {
          rowErrors.push("Name is required.");
        }
        const email = normalizeEmail(row.fields.email);
        if (!email) {
          rowErrors.push("Email is required.");
        } else if (!EMAIL_PATTERN.test(email)) {
          rowErrors.push(`"${row.fields.email}" is not a valid email address.`);
        } else {
          if (seenEmails.has(email)) {
            rowErrors.push("Duplicate email within the file.");
          }
          seenEmails.add(email);
          if (existingEmails.has(email)) {
            rowErrors.push("An employee with this email already exists.");
          }
        }
        const role = resolveRoleFromRoster(activeRoles, row.fields.role);
        if (!row.fields.role) {
          rowErrors.push("Role is required.");
        } else if (!role) {
          rowErrors.push(`Unknown role "${row.fields.role}".`);
        }
        const department = resolveDepartmentFromRoster(activeDepartments, row.fields.department);
        if (!row.fields.department) {
          rowErrors.push("Department is required.");
        } else if (!department) {
          rowErrors.push(`Unknown department "${row.fields.department}".`);
        }
        let managerId: string | null = null;
        if (row.fields.manager) {
          const manager = employeeByEmail.get(normalizeEmail(row.fields.manager)) ?? null;
          if (!manager) {
            rowErrors.push(`Unknown manager "${row.fields.manager}".`);
          } else if (!manager.active) {
            rowErrors.push("A deactivated employee cannot be a manager.");
          } else {
            managerId = manager.id;
          }
        } else if (department) {
          if (!department.head) {
            rowErrors.push(
              `The "${department.name}" department has no head; assign one before importing members.`,
            );
          } else {
            const head = department.head
              ? (employeeById.get(department.head.id) ?? null)
              : null;
            if (!head || !head.active) {
              rowErrors.push(
                `The head of "${department.name}" is not an active employee; assign an active head first.`,
              );
            } else {
              managerId = head.id;
            }
          }
        }
        if (rowErrors.length > 0) {
          failed.push({
            rowNumber: row.rowNumber,
            email,
            status: "failed",
            error: rowErrors.join(" "),
          });
          continue;
        }
        resolved.push({
          rowNumber: row.rowNumber,
          input: {
            id: `emp-${crypto.randomUUID().slice(0, 8)}`,
            name,
            email,
            roleId: role!.id,
            departmentId: department!.id,
            managerId,
          },
          role: role!,
          department: department!,
        });
      }

      if (failed.length > 0) {
        // All-or-nothing: a single bad row means nothing is written.
        return { total: parsed.rows.length + parsed.errors.length, created: [], failed };
      }
      if (resolved.length === 0) {
        throw new AdminError("validation", "The CSV has no rows to import.");
      }
      await store.createEmployees(
        actor.organizationId,
        resolved.map((entry) => entry.input),
      );
      await audit(actor, "import-employees", `Imported ${resolved.length} employees from a roster.`);
      return {
        total: resolved.length,
        created: resolved.map((entry) => ({
          rowNumber: entry.rowNumber,
          email: entry.input.email,
          status: "created",
          employee: {
            id: entry.input.id,
            organizationId: actor.organizationId,
            name: entry.input.name,
            email: entry.input.email,
            department: entry.department.name,
            departmentId: entry.department.id,
            role: {
              id: entry.role.id,
              code: entry.role.code,
              displayName: entry.role.displayName,
              capabilities: entry.role.capabilities,
            },
            active: true,
            managerId: entry.input.managerId ?? null,
          },
        })),
        failed: [],
      };
    },

    async listDepartments(actorId) {
      const actor = await requireAdmin(actorId);
      return store.listDepartments(actor.organizationId);
    },

    async createDepartment(actorId, input) {
      const actor = await requireAdmin(actorId);
      const name = input.name.trim();
      if (!name) {
        throw new AdminError("validation", "Department needs a name.");
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Department name is too long (max 120 characters).");
      }
      // A department is created with its head (ADR-0019): a department has
      // no meaning without the manager new members will default to.
      const head = await store.getEmployee(input.headId);
      if (!head || head.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Department head does not exist.");
      }
      if (!head.active) {
        throw new AdminError("validation", "A deactivated employee cannot be a department head.");
      }
      const department = await store.createDepartment(actor.organizationId, {
        name,
        headId: head.id,
      });
      await audit(
        actor,
        "create-department",
        `Created the "${name}" department headed by ${head.name}.`,
      );
      return department;
    },

    async setDepartmentHead(actorId, { departmentId, headId }) {
      const actor = await requireAdmin(actorId);
      const departments = await store.listDepartments(actor.organizationId);
      const department = departments.find((candidate) => candidate.id === departmentId);
      if (!department) {
        throw new AdminError("not-found", "Department does not exist.");
      }
      if (headId.length > MAX_EMPLOYEE_ID_LENGTH) {
        throw new AdminError("validation", "Employee id is too long.");
      }
      const head = await store.getEmployee(headId);
      if (!head || head.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Department head does not exist.");
      }
      if (!head.active) {
        throw new AdminError("validation", "A deactivated employee cannot be a department head.");
      }
      if (department.headId === head.id) {
        return;
      }
      await store.setDepartmentHead(departmentId, head.id);
      await audit(
        actor,
        "set-department-head",
        `${head.name} is now the head of the ${department.name} department.`,
      );
    },

    async deactivateDepartment(actorId, departmentId) {
      const actor = await requireAdmin(actorId);
      const departments = await store.listDepartments(actor.organizationId);
      const department = departments.find((candidate) => candidate.id === departmentId);
      if (!department) {
        throw new AdminError("not-found", "Department does not exist.");
      }
      await store.deactivateDepartment(departmentId);
      await audit(actor, "deactivate-department", `Deactivated the "${department.name}" department.`);
    },

    async listRoles(actorId) {
      const actor = await requireAdmin(actorId);
      return store.listRoles(actor.organizationId);
    },

    async createRole(actorId, input) {
      const actor = await requireAdmin(actorId);
      const code = input.code.trim();
      const displayName = input.displayName.trim();
      if (!code || !displayName) {
        throw new AdminError("validation", "A role needs a code and a display name.");
      }
      if (code.length > MAX_CODE_LENGTH || displayName.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Role code or display name is too long.");
      }
      // Roles are org-wide definitions: no department scoping on creation.
      // Custom roles are created with their privilege set (ADR-0015);
      // absent, the store applies the submit-only default.
      const capabilities =
        input.capabilities === null || input.capabilities === undefined
          ? undefined
          : parseRoleCapabilities(input.capabilities);
      if (input.capabilities !== null && input.capabilities !== undefined && !capabilities) {
        throw new AdminError("validation", `A capability set must be ${CAPABILITY_KEYS.length} booleans.`);
      }
      const role = await store.createRole(actor.organizationId, {
        code,
        displayName,
        capabilities: capabilities ?? undefined,
      });
      await audit(actor, "create-role", `Created the "${displayName}" role.`);
      return role;
    },

    // Changes a role's capability set. Removing an action privilege
    // (approve / finance access) while claims are pending at the
    // role's steps must be confirmed by the caller; the unconfirmed
    // conflict carries the full impact so the console can render the
    // warning dialog from the rejection alone. Confirmed removals leave the
    // affected steps to be swept forward by the absence catch-up, and the
    // response names the pending claims that will skip.
    async updateRoleCapabilities(actorId, roleId, capabilities, options = {}) {
      const actor = await requireAdmin(actorId);
      const parsed = parseRoleCapabilities(capabilities);
      if (!parsed) {
        throw new AdminError("validation", `A capability set must be ${CAPABILITY_KEYS.length} booleans.`);
      }
      const role = await requireActiveRole(actor.organizationId, roleId);
      if (role.code === SUPERADMIN_ROLE_CODE) {
        throw new AdminError(
          "validation",
          "Superadmin privileges are built in and cannot be edited.",
        );
      }
      const before = resolveRoleCapabilities(role);
      const removed = removedActionPrivileges(before, parsed);
      const pendingClaims =
        removed.length > 0
          ? await pendingClaimsAtRoleSteps(actor.organizationId, roleId, role.displayName)
          : [];
      if (removed.length > 0 && pendingClaims.length > 0 && options.confirmed !== true) {
        const labels = removed.map((privilege) => ACTION_PRIVILEGE_LABELS[privilege]).join(" and ");
        throw new AdminError(
          "conflict",
          `Removing ${labels} affects ${pendingClaims.length} pending claim${pendingClaims.length === 1 ? "" : "s"} at this role's steps. Confirm the removal to proceed.`,
          { removedActionPrivileges: removed, pendingClaims },
        );
      }
      await store.setRoleCapabilities(roleId, parsed);
      await audit(
        actor,
        "update-role-capabilities",
        `Updated the "${role.displayName}" role privileges.`,
      );
      const updated = await store.getRole(roleId);
      if (!updated) {
        throw new AdminError("not-found", "Role does not exist.");
      }
      return { role: updated, pendingClaims };
    },

    async deactivateRole(actorId, roleId) {
      const actor = await requireAdmin(actorId);
      const role = await requireActiveRole(actor.organizationId, roleId);
      if (role.locked) {
        throw new AdminError("locked", "Locked predefined roles cannot be deactivated.");
      }
      const [employees, flows] = await Promise.all([
        store.listEmployees(actor.organizationId),
        store.listFlows(actor.organizationId),
      ]);
      const assignedToEmployee = employees.some((employee) => employee.role?.id === role.id);
      if (assignedToEmployee) {
        throw new AdminError(
          "validation",
          `The "${role.displayName}" role is assigned to at least one employee.`,
        );
      }
      const referencedByPublishedFlow = flows.some(
        (flow) =>
          flow.status === "published" &&
          (flow.roleId === role.id ||
            flow.steps.some((step) => step.kind === "role" && step.roleId === role.id)),
      );
      if (referencedByPublishedFlow) {
        throw new AdminError(
          "validation",
          `The "${role.displayName}" role is referenced by a published flow.`,
        );
      }
      await store.deactivateRole(roleId);
      await audit(actor, "deactivate-role", `Deactivated the "${role.displayName}" role.`);
    },

    async createFlow(actorId, input) {
      const actor = await requireAdmin(actorId);
      const name = input.name.trim();
      if (!name) {
        throw new AdminError("validation", "Flow needs a name.");
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Flow name is too long (max 120 characters).");
      }
      await requireActiveRole(actor.organizationId, input.roleId);
      await validateFlowSteps(actor.organizationId, input.steps);
      const existingFlows = await store.listFlows(actor.organizationId);
      const duplicate = existingFlows.find(
        (flow) =>
          flow.name === name && flow.roleId === input.roleId && flow.status === "draft",
      );
      if (duplicate) {
        throw new AdminError(
          "validation",
          `A draft flow named "${name}" for this role already exists.`,
        );
      }
      const flow = await store.createFlow(actor.organizationId, {
        name,
        roleId: input.roleId,
        steps: [...input.steps],
      });
      await audit(actor, "create-flow-draft", `Created the "${name}" flow draft.`);
      return flow;
    },

    async updateFlow(actorId, flowId, input) {
      const actor = await requireAdmin(actorId);
      const name = input.name.trim();
      if (!name) {
        throw new AdminError("validation", "Flow needs a name.");
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Flow name is too long (max 120 characters).");
      }
      if (!input.roleId) {
        throw new AdminError("validation", "Flow needs an assigned role.");
      }
      await validateFlowSteps(actor.organizationId, input.steps);
      const updated = await store.updateFlow(flowId, {
        name,
        roleId: input.roleId,
        steps: [...input.steps],
      });
      await audit(actor, "update-flow", `Updated the "${name}" flow.`);
      return updated;
    },

    // The Finance Executive role is the required terminal verification-and-
    // payment stage: a Flow cannot be published unless its last step targets
    // it, so the payment completion stage can never be missing. Delegation
    // and absence auto-skips also treat the terminal step as non-skippable
    // (see the expenses command layer).
    async publishFlow(actorId, flowId) {
      const actor = await requireAdmin(actorId);
      const flows = await store.listFlows(actor.organizationId);
      const flow = flows.find((candidate) => candidate.id === flowId);
      if (!flow) {
        throw new AdminError("not-found", "Flow does not exist.");
      }
      if (flow.status !== "draft") {
        throw new AdminError("validation", "Only a draft flow can be published.");
      }
      await validateFlowSteps(actor.organizationId, flow.steps);
      const lastStep = flow.steps[flow.steps.length - 1];
      if (lastStep.kind !== "role") {
        throw new AdminError(
          "validation",
          "The last step of a flow must be the Finance Executive role.",
        );
      }
      const terminalRole = await requireActiveRole(actor.organizationId, lastStep.roleId);
      if (terminalRole.code !== FINANCE_EXECUTIVE_ROLE_CODE) {
        throw new AdminError(
          "validation",
          "The last step of a flow must be the Finance Executive role.",
        );
      }
      const published = await store.publishFlow(flowId);
      await audit(actor, "publish-flow", `Published the "${flow.name}" flow.`);
      return published;
    },

    async deleteFlow(actorId, flowId) {
      const actor = await requireAdmin(actorId);
      const flows = await store.listFlows(actor.organizationId);
      const flow = flows.find((candidate) => candidate.id === flowId);
      if (!flow) {
        throw new AdminError("not-found", "Flow does not exist.");
      }
      await store.deleteFlow(flowId);
      await audit(actor, "delete-flow", `Deleted the "${flow.name}" flow.`);
    },

    // The company-wise absence auto-skip setting (ADR-0018). Reading an
    // organization without a settings row resolves to the 3-day default,
    // so existing companies keep today's behavior until the value changes.
    async getAbsenceTimeoutDays(actorId) {
      const actor = await requireSuperadmin(actorId);
      return store.getAbsenceTimeoutDays(actor.organizationId);
    },

    async setAbsenceTimeoutDays(actorId, days) {
      const actor = await requireSuperadmin(actorId);
      if (!Number.isInteger(days) || days < 1 || days > MAX_ABSENCE_TIMEOUT_DAYS) {
        throw new AdminError(
          "validation",
          `The absence timeout must be a whole number of days between 1 and ${MAX_ABSENCE_TIMEOUT_DAYS}.`,
        );
      }
      if (days === (await store.getAbsenceTimeoutDays(actor.organizationId))) {
        return;
      }
      await store.setAbsenceTimeoutDays(actor.organizationId, days);
      await audit(
        actor,
        "set-absence-timeout",
        `Absence auto-skip timeout set to ${days} day${days === 1 ? "" : "s"}.`,
      );
    },
  };
}
