import { SUPERADMIN_ROLE_CODE } from "../shared/authorization";

export { SUPERADMIN_ROLE_CODE };

export type FlowStatus = "draft" | "published" | "archived";

export type AdminRoleRef = {
  id: string;
  code: string;
  displayName: string;
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
};

export type DepartmentInput = {
  name: string;
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

export interface AdminStore {
  listEmployees(organizationId: string): Promise<AdminEmployee[]>;
  getEmployee(id: string): Promise<AdminEmployee | null>;
  createEmployee(
    organizationId: string,
    input: { id: string; name: string; email: string },
  ): Promise<AdminEmployee>;
  setEmployeeRole(employeeId: string, roleId: string): Promise<void>;
  setEmployeeDepartment(employeeId: string, departmentId: string): Promise<void>;
  setEmployeeActive(employeeId: string, active: boolean): Promise<void>;
  setEmployeeManager(employeeId: string, managerId: string | null): Promise<void>;
  listDepartments(organizationId: string): Promise<AdminDepartment[]>;
  createDepartment(organizationId: string, input: DepartmentInput): Promise<AdminDepartment>;
  deactivateDepartment(departmentId: string): Promise<void>;
  listRoles(organizationId: string): Promise<AdminRole[]>;
  getRole(roleId: string): Promise<AdminRole | null>;
  createRole(organizationId: string, input: RoleInput): Promise<AdminRole>;
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
}
