export const SUPERADMIN_ROLE_CODE = "superadmin";
export const HR_ADMINISTRATOR_ROLE_CODE = "hr-administrator";

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
  departmentId: string | null;
  active: boolean;
};

export type RoleInput = {
  code: string;
  displayName: string;
  departmentId: string | null;
};

export type FlowInput = {
  name: string;
  roleId: string;
  steps: string[];
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

export interface AdminStore {
  listEmployees(organizationId: string): Promise<AdminEmployee[]>;
  getEmployee(id: string): Promise<AdminEmployee | null>;
  setEmployeeRole(employeeId: string, roleId: string): Promise<void>;
  setEmployeeDepartment(employeeId: string, departmentId: string): Promise<void>;
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
}
