// Role authority (ADR-0015): capabilities are per-role data, resolved from
// the role record everywhere authorization is checked. The hardcoded
// code-keyed map is gone; a role record carries its own six privilege
// toggles (amended by ADR-0024 and ADR-0026), and missing or unknown roles
// fall back to the safe submit-only default. Superadmin is not a
// toggleable role: the built-in console owner keeps every privilege by
// construction, regardless of what a role record says.

export type RoleCapabilities = {
  canSubmit: boolean;
  canApprove: boolean;
  canAccessFinance: boolean;
  approveBankDetails: boolean;
  canViewOrganizationActivity: boolean;
  canAccessAdminConsole: boolean;
};

// The safe default for role records that carry no capability data: unknown
// roles, legacy rows, and role-less employees can submit and grant nothing.
export const SUBMIT_ONLY_CAPABILITIES: RoleCapabilities = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: false,
  approveBankDetails: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

// The built-in console owner: every privilege, granted by construction and
// never exposed as a toggle. Its two exclusive powers (delegation, company
// auto-skip configuration) are not part of the catalog at all (ADR-0015).
export const SUPERADMIN_CAPABILITIES: RoleCapabilities = {
  canSubmit: true,
  canApprove: true,
  canAccessFinance: true,
  approveBankDetails: true,
  canViewOrganizationActivity: true,
  canAccessAdminConsole: true,
};

// The five locked predefined roles plus the built-in Superadmin identity.
// Superadmin is not assignable as a role; it is the built-in console owner.
// Locked semantics are unchanged: locked means not deletable, never
// not editable - the predefined roles' privilege toggles are editable.
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

// The two action privileges (ADR-0015): removing one of these mid-flight is
// governed - the caller is warned about the pending claims at the role's
// steps and must confirm the removal, because losing either one leaves a
// pending step with no eligible actor and the absence sweep advances it.
// canSubmit, canViewOrganizationActivity and canAccessAdminConsole are not
// action privileges.
export const ACTION_PRIVILEGES = ["canApprove", "canAccessFinance"] as const;
export type ActionPrivilege = (typeof ACTION_PRIVILEGES)[number];

// The role-record shape resolution reads capabilities from: role refs on
// employees and the full role records from the admin store all carry the
// optional capability set, populated by the stores from the roles table.
export type RoleCapabilitiesRecord = {
  code: string;
  capabilities?: RoleCapabilities | null;
};

export function resolveRoleCapabilities(
  role: RoleCapabilitiesRecord | null | undefined,
): RoleCapabilities {
  if (role === null || role === undefined) return SUBMIT_ONLY_CAPABILITIES;
  if (role.code === SUPERADMIN_ROLE_CODE) return SUPERADMIN_CAPABILITIES;
  return role.capabilities ?? SUBMIT_ONLY_CAPABILITIES;
}

// The action privileges a change removes, e.g. when a role loses approve.
// Only removals of action privileges with pending claims at the role's
// steps require the caller's confirmation (ADR-0015).
export function removedActionPrivileges(
  before: RoleCapabilities,
  after: RoleCapabilities,
): ActionPrivilege[] {
  return ACTION_PRIVILEGES.filter((privilege) => before[privilege] && !after[privilege]);
}

// The removal-warning label for each action privilege, shared by the
// command-layer conflict message and the console's confirm dialog so the
// two copies of this text cannot drift.
export const ACTION_PRIVILEGE_LABELS: Record<ActionPrivilege, string> = {
  canApprove: "approve",
  canAccessFinance: "finance access",
};
