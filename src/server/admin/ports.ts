export const ADMIN_ROLES = [
  "Employee",
  "Manager",
  "Finance reviewer",
  "IT reviewer",
  "HR administrator",
  "System administrator",
  "CEO delegate",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type FlowStatus = "draft" | "published";

export type AdminEmployee = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  department: string;
  role: AdminRole | null;
};

export type FlowInput = {
  name: string;
  scope: string;
  steps: AdminRole[];
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
  setEmployeeRole(employeeId: string, role: AdminRole): Promise<void>;
  createFlow(organizationId: string, input: FlowInput): Promise<FlowDraft>;
  listFlows(organizationId: string): Promise<FlowDraft[]>;
  appendAudit(organizationId: string, event: AuditEvent): Promise<void>;
}

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}
