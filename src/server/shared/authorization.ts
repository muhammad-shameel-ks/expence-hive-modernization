export type RoleCapabilities = {
  canSubmit: boolean;
  canApprove: boolean;
  canAccessFinance: boolean;
  canViewOrganizationActivity: boolean;
  canAccessAdminConsole: boolean;
};

const SUBMIT_ONLY: RoleCapabilities = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

const APPROVER: RoleCapabilities = {
  ...SUBMIT_ONLY,
  canApprove: true,
};

const FINANCE: RoleCapabilities = {
  ...SUBMIT_ONLY,
  canAccessFinance: true,
};

const FINANCE_HEAD: RoleCapabilities = {
  ...FINANCE,
  canViewOrganizationActivity: true,
};

const SUPERADMIN: RoleCapabilities = {
  canSubmit: true,
  canApprove: true,
  canAccessFinance: true,
  canViewOrganizationActivity: true,
  canAccessAdminConsole: true,
};

// The five locked predefined roles plus the built-in Superadmin identity.
// Superadmin is not assignable as a role; it is the built-in console owner.
export const LOCKED_ROLE_CODES = [
  "intern",
  "executive",
  "manager",
  "finance-head",
  "finance-executive",
] as const;

export const SUPERADMIN_ROLE_CODE = "superadmin";
export const MANAGER_ROLE_CODE = "manager";
export const FINANCE_HEAD_ROLE_CODE = "finance-head";
export const FINANCE_EXECUTIVE_ROLE_CODE = "finance-executive";

// The single source of truth for role authority, shared by the admin
// console and the expense flow. Only the locked catalog and Superadmin have
// grants here; custom roles and any other code (HR codes deliberately
// included) resolve to the submit-only default and grant nothing.
const CAPABILITIES_BY_ROLE_CODE: Record<string, RoleCapabilities> = {
  superadmin: SUPERADMIN,
  intern: SUBMIT_ONLY,
  executive: SUBMIT_ONLY,
  manager: APPROVER,
  "finance-head": FINANCE_HEAD,
  "finance-executive": FINANCE,
};

export function resolveRoleCapabilities(roleCode: string | undefined): RoleCapabilities {
  if (roleCode === undefined) return SUBMIT_ONLY;
  return CAPABILITIES_BY_ROLE_CODE[roleCode] ?? SUBMIT_ONLY;
}
