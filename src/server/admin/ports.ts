import { SUPERADMIN_ROLE_CODE, type RoleCapabilities } from "../shared/authorization";
import { DEFAULT_ABSENCE_TIMEOUT_DAYS } from "../shared/absence-timeout";

export { SUPERADMIN_ROLE_CODE };
export { DEFAULT_ABSENCE_TIMEOUT_DAYS };

export type FlowStatus = "draft" | "published" | "archived";

export type AdminRoleRef = {
  id: string;
  code: string;
  displayName: string;
  // The six privilege toggles (ADR-0015, amended by ADR-0024/0026),
  // resolved from the roles table. Present on records read from the store;
  // absent on legacy data, which resolves to the submit-only default.
  capabilities?: RoleCapabilities | null;
};

export type AdminEmployee = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  department: string;
  departmentId?: string | null;
  role: AdminRoleRef | null;
  // The employee lifecycle flag: deactivated staff cannot be reassigned
  // approval work (enforced by the expense side in a later slice) and are
  // blocked from signing in by the identity seam.
  active: boolean;
  // The person this employee reports to, from hierarchy_assignments.
  managerId: string | null;
};

export type AdminDepartment = {
  id: string;
  organizationId: string;
  name: string;
  active: boolean;
  // The department head (ADR-0019): every department is created with one
  // and the head remains editable. headId is null for pre-existing
  // headless departments; the console surfaces those as incomplete.
  headId: string | null;
  head: { id: string; name: string } | null;
};

export type DepartmentInput = {
  name: string;
  headId: string;
};

export type AdminRole = AdminRoleRef & {
  organizationId: string;
  // The roles.department_id column is retained in the schema for
  // forward-compatibility but is no longer written or validated: roles are
  // org-wide definitions and the department lives on the person.
  departmentId: string | null;
  active: boolean;
  locked: boolean;
};

export type RoleInput = {
  code: string;
  displayName: string;
  // Custom roles are created with a privilege set (ADR-0015). Absent, the
  // store defaults to the submit-only grant.
  capabilities?: RoleCapabilities | null;
};

import type { AmountGuard, AmountGuardOperator } from "../shared/amount-guard";
export type { AmountGuard, AmountGuardOperator };

// One step of a Flow: a 'role' step targets any locked or custom role,
// while a 'team-lead' step targets the requester's assigned named person
// (kind 'team-lead' carries no role id - the hierarchy assignment governs).
// Any step may carry an optional guard; absent or null means unguarded.
export type FlowStepInput = (
  | { kind: "role"; roleId: string }
  | { kind: "team-lead" }
) & {
  guard?: AmountGuard | null;
};

export type FlowInput = {
  name: string;
  roleId: string;
  steps: FlowStepInput[];
};

export type FlowDraft = FlowInput & {
  id: string;
  status: FlowStatus;
};

export type AuditEvent = {
  id: string;
  organizationId: string;
  actorId: string;
  action: string;
  detail: string;
  createdAt: Date;
};

// from/to are ISO date strings (YYYY-MM-DD or a full ISO instant). A bare
// date means the whole day: `from` includes that day from its start and `to`
// includes it through its end (the query compares against created_at).
export type AuditFilter = {
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
};

// A fully-specified employee write: creation can carry the role, department
// and manager up front (admin creation, bulk import), or none of them
// (first-sign-in provisioning creates a bare record).
export type EmployeeCreateInput = {
  id: string;
  name: string;
  email: string;
  roleId?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
};

export interface AdminStore {
  listEmployees(organizationId: string): Promise<AdminEmployee[]>;
  getEmployee(id: string): Promise<AdminEmployee | null>;
  findEmployeeByEmail(organizationId: string, email: string): Promise<AdminEmployee | null>;
  createEmployee(
    organizationId: string,
    input: EmployeeCreateInput,
  ): Promise<AdminEmployee>;
  // Bulk creation with all-or-nothing semantics: either every row is
  // written or none is (a single transaction in the pg store).
  createEmployees(
    organizationId: string,
    inputs: EmployeeCreateInput[],
  ): Promise<AdminEmployee[]>;
  setEmployeeRole(employeeId: string, roleId: string): Promise<void>;
  setEmployeeDepartment(employeeId: string, departmentId: string): Promise<void>;
  setEmployeeActive(employeeId: string, active: boolean): Promise<void>;
  setEmployeeManager(employeeId: string, managerId: string | null): Promise<void>;
  listDepartments(organizationId: string): Promise<AdminDepartment[]>;
  createDepartment(organizationId: string, input: DepartmentInput): Promise<AdminDepartment>;
  setDepartmentHead(departmentId: string, headId: string): Promise<void>;
  deactivateDepartment(departmentId: string): Promise<void>;
  listRoles(organizationId: string): Promise<AdminRole[]>;
  getRole(roleId: string): Promise<AdminRole | null>;
  createRole(organizationId: string, input: RoleInput): Promise<AdminRole>;
  // Updates the six privilege toggles of a role (ADR-0015). The mid-flight
  // confirmation guard lives in the command layer; the store only writes.
  setRoleCapabilities(roleId: string, capabilities: RoleCapabilities): Promise<void>;
  deactivateRole(roleId: string): Promise<void>;
  createFlow(organizationId: string, input: FlowInput): Promise<FlowDraft>;
  updateFlow(flowId: string, input: FlowInput): Promise<FlowDraft>;
  publishFlow(flowId: string): Promise<FlowDraft>;
  deleteFlow(flowId: string): Promise<void>;
  listFlows(organizationId: string): Promise<FlowDraft[]>;
  appendAudit(organizationId: string, event: AuditEvent): Promise<void>;
  listAuditEvents(
    organizationId: string,
    filter: AuditFilter,
    pagination: { page: number; pageSize: number },
  ): Promise<{ events: AuditEvent[]; total: number }>;
  // The company-wise absence auto-skip setting (ADR-0018), stored in
  // organization_settings. Reading an organization without a row resolves
  // to the 3-day default, so existing organizations keep today's behavior
  // until a Superadmin changes the value.
  getAbsenceTimeoutDays(organizationId: string): Promise<number>;
  setAbsenceTimeoutDays(organizationId: string, days: number): Promise<void>;
  // Every organization on the platform, for the scheduled sweep worker
  // (ADR-0018): the worker scans each organization's in-flight claims
  // against its own configured timeout.
  listOrganizations(): Promise<string[]>;
}
