import { describe, expect, it } from "vitest";
import {
  LOCKED_ROLE_CODES,
  resolveRoleCapabilities,
  SUPERADMIN_ROLE_CODE,
  type RoleCapabilities,
} from "./authorization";

const SUBMIT_ONLY: RoleCapabilities = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

describe("resolveRoleCapabilities", () => {
  it("gives Superadmin every capability", () => {
    expect(resolveRoleCapabilities(SUPERADMIN_ROLE_CODE)).toEqual({
      canSubmit: true,
      canApprove: true,
      canAccessFinance: true,
      canViewOrganizationActivity: true,
      canAccessAdminConsole: true,
    });
  });

  it.each(["intern", "executive"])("gives %s submit-only capabilities", (code) => {
    expect(resolveRoleCapabilities(code)).toEqual(SUBMIT_ONLY);
  });

  it("gives Manager submit and approve capabilities, but no finance or admin powers", () => {
    expect(resolveRoleCapabilities("manager")).toEqual({
      canSubmit: true,
      canApprove: true,
      canAccessFinance: false,
      canViewOrganizationActivity: false,
      canAccessAdminConsole: false,
    });
  });

  it("gives Finance Head submit, finance access, and organization activity, but no approve or admin powers", () => {
    expect(resolveRoleCapabilities("finance-head")).toEqual({
      canSubmit: true,
      canApprove: false,
      canAccessFinance: true,
      canViewOrganizationActivity: true,
      canAccessAdminConsole: false,
    });
  });

  it("gives Finance Executive submit and finance access, but no approve, organization activity, or admin powers", () => {
    expect(resolveRoleCapabilities("finance-executive")).toEqual({
      canSubmit: true,
      canApprove: false,
      canAccessFinance: true,
      canViewOrganizationActivity: false,
      canAccessAdminConsole: false,
    });
  });

  it.each(["employee", "it-reviewer", "ceo", "finance-reviewer", "hr", "hr-administrator"])(
    "gives %s no special grants beyond the submit-only default",
    (code) => {
      expect(resolveRoleCapabilities(code)).toEqual(SUBMIT_ONLY);
    },
  );

  it("gives a custom role code the submit-only default", () => {
    expect(resolveRoleCapabilities("team-lead")).toEqual(SUBMIT_ONLY);
  });

  it("gives an unknown role code the submit-only default", () => {
    expect(resolveRoleCapabilities("sales-lead")).toEqual(SUBMIT_ONLY);
  });

  it("handles an undefined role code safely with the submit-only default", () => {
    expect(resolveRoleCapabilities(undefined)).toEqual(SUBMIT_ONLY);
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
