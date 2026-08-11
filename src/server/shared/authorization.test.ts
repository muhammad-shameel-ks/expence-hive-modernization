import { describe, expect, it } from "vitest";
import {
  LOCKED_ROLE_CODES,
  removedActionPrivileges,
  resolveRoleCapabilities,
  SUBMIT_ONLY_CAPABILITIES,
  SUPERADMIN_CAPABILITIES,
  SUPERADMIN_ROLE_CODE,
  type RoleCapabilities,
  type RoleCapabilitiesRecord,
} from "./authorization";

const managerCapabilities: RoleCapabilities = {
  canSubmit: true,
  canApprove: true,
  canAccessFinance: false,
  canHold: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

const financeHeadCapabilities: RoleCapabilities = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: true,
  canHold: false,
  canViewOrganizationActivity: true,
  canAccessAdminConsole: false,
};

const financeExecutiveCapabilities: RoleCapabilities = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: true,
  canHold: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

// The capability set a role record carries (ADR-0015): resolution reads the
// record, not a code-keyed map.
const role = (code: string, capabilities?: RoleCapabilities | null): RoleCapabilitiesRecord => ({
  code,
  capabilities,
});

describe("resolveRoleCapabilities", () => {
  it("gives Superadmin every capability by construction, even without a record set", () => {
    expect(resolveRoleCapabilities(role(SUPERADMIN_ROLE_CODE))).toEqual(SUPERADMIN_CAPABILITIES);
    expect(resolveRoleCapabilities(role(SUPERADMIN_ROLE_CODE, undefined))).toEqual(
      SUPERADMIN_CAPABILITIES,
    );
  });

  it("resolves Manager capabilities from the role record", () => {
    expect(resolveRoleCapabilities(role("manager", managerCapabilities))).toEqual(
      managerCapabilities,
    );
  });

  it("resolves Finance Head capabilities from the role record", () => {
    expect(resolveRoleCapabilities(role("finance-head", financeHeadCapabilities))).toEqual(
      financeHeadCapabilities,
    );
  });

  it("resolves Finance Executive capabilities from the role record", () => {
    expect(resolveRoleCapabilities(role("finance-executive", financeExecutiveCapabilities))).toEqual(
      financeExecutiveCapabilities,
    );
  });

  it("treats a role record without a capability set as submit-only", () => {
    expect(resolveRoleCapabilities(role("intern"))).toEqual(SUBMIT_ONLY_CAPABILITIES);
    expect(resolveRoleCapabilities(role("team-lead", null))).toEqual(SUBMIT_ONLY_CAPABILITIES);
  });

  it("treats an unknown role code without a capability set as submit-only", () => {
    expect(resolveRoleCapabilities(role("sales-lead"))).toEqual(SUBMIT_ONLY_CAPABILITIES);
  });

  it("resolves a custom role's own record set, whatever the code", () => {
    const custom = { ...managerCapabilities, canHold: true };
    expect(resolveRoleCapabilities(role("hr-admin", custom))).toEqual(custom);
  });

  it("handles a null role and an undefined role with the submit-only default", () => {
    expect(resolveRoleCapabilities(null)).toEqual(SUBMIT_ONLY_CAPABILITIES);
    expect(resolveRoleCapabilities(undefined)).toEqual(SUBMIT_ONLY_CAPABILITIES);
  });

  it("gives the submit-only default every false action privilege including hold", () => {
    expect(SUBMIT_ONLY_CAPABILITIES).toEqual({
      canSubmit: true,
      canApprove: false,
      canAccessFinance: false,
      canHold: false,
      canViewOrganizationActivity: false,
      canAccessAdminConsole: false,
    });
  });

  it("exposes the locked catalog and superadmin code for the admin console", () => {
    expect(LOCKED_ROLE_CODES).toEqual([
      "intern",
      "executive",
      "manager",
      "finance-head",
      "finance-executive",
    ]);
    expect(SUPERADMIN_ROLE_CODE).toBe("superadmin");
  });
});

describe("removedActionPrivileges", () => {
  it("reports the action privileges a change removes", () => {
    expect(
      removedActionPrivileges(managerCapabilities, {
        ...managerCapabilities,
        canApprove: false,
      }),
    ).toEqual(["canApprove"]);
  });

  it("reports finance access removals", () => {
    expect(
      removedActionPrivileges(financeHeadCapabilities, {
        ...financeHeadCapabilities,
        canAccessFinance: false,
      }),
    ).toEqual(["canAccessFinance"]);
  });

  it("ignores hold and other non-action capabilities and additions", () => {
    const holdingRole: RoleCapabilities = { ...managerCapabilities, canHold: true };
    expect(
      removedActionPrivileges(holdingRole, {
        ...holdingRole,
        canHold: false,
      }),
    ).toEqual([]);
    expect(
      removedActionPrivileges(managerCapabilities, {
        ...managerCapabilities,
        canViewOrganizationActivity: false,
        canSubmit: false,
      }),
    ).toEqual([]);
    expect(
      removedActionPrivileges(managerCapabilities, {
        ...managerCapabilities,
        canAccessFinance: true,
      }),
    ).toEqual([]);
  });

  it("reports nothing for an unchanged set", () => {
    expect(removedActionPrivileges(managerCapabilities, managerCapabilities)).toEqual([]);
  });
});
