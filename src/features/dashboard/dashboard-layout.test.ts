import { describe, expect, it } from "vitest";
import {
  DASHBOARD_LAYOUTS,
  dashboardLayoutForRole,
  layoutKeyForRole,
  renderableSections,
} from "./dashboard-layout";

const sectionKinds = (sections: { section: string }[]) => sections.map((s) => s.section);

describe("layoutKeyForRole", () => {
  it("maps each seeded role code to its hardcoded layout", () => {
    expect(layoutKeyForRole("employee", "employee")).toBe("employee");
    expect(layoutKeyForRole("employee", "executive")).toBe("employee");
    expect(layoutKeyForRole("employee", "intern")).toBe("employee");
    expect(layoutKeyForRole("approver", "manager")).toBe("approver");
    expect(layoutKeyForRole("finance", "finance-head")).toBe("finance");
    expect(layoutKeyForRole("finance", "finance-executive")).toBe("finance");
    expect(layoutKeyForRole("finance", "superadmin")).toBe("superadmin");
  });

  it("resolves approving and finance custom roles through their dashboard view", () => {
    expect(layoutKeyForRole("approver", "team-lead")).toBe("approver");
    expect(layoutKeyForRole("finance", "payments-ops")).toBe("finance");
  });

  it("falls back to the default layout for unknown roles", () => {
    expect(layoutKeyForRole("employee", "mystery-role")).toBe("default");
    expect(layoutKeyForRole("employee", undefined)).toBe("default");
    expect(layoutKeyForRole("employee", "")).toBe("default");
  });
});

describe("dashboardLayoutForRole", () => {
  it("gives employees the expense list full width first, the attention card after it", () => {
    const layout = dashboardLayoutForRole("employee", "executive");
    expect(sectionKinds(layout.sections)).toEqual(["overview", "attention", "activity"]);
    expect(layout.sections[0].className).toContain("lg:col-span-2");
    expect(layout.sections[1].className).toContain("lg:col-span-2");
  });

  it("gives approvers and finance the attention card first and wider, the expense list below", () => {
    const approver = dashboardLayoutForRole("approver", "manager");
    expect(sectionKinds(approver.sections)).toEqual(["attention", "overview", "activity"]);
    expect(approver.sections[0].className).toContain("lg:col-span-2");
    expect(approver.sections[1].className).toContain("lg:col-span-2");
    for (const roleCode of ["finance-head", "finance-executive"]) {
      const finance = dashboardLayoutForRole("finance", roleCode);
      expect(sectionKinds(finance.sections)).toEqual(["attention", "overview", "activity"]);
      expect(finance.sections[0].className).toContain("lg:col-span-2");
    }
  });

  it("keeps the admin-first default for superadmin", () => {
    const layout = dashboardLayoutForRole("finance", "superadmin");
    expect(sectionKinds(layout.sections)).toEqual(["overview", "attention", "activity"]);
    expect(layout.sections[0].className).not.toContain("col-span");
    expect(layout.sections[1].className).not.toContain("col-span");
    expect(layout.sections[2].className).toContain("lg:col-span-2");
  });

  it("falls back to the default layout for an unknown role", () => {
    expect(dashboardLayoutForRole("employee", "mystery-role")).toBe(DASHBOARD_LAYOUTS.default);
    expect(sectionKinds(DASHBOARD_LAYOUTS.default.sections)).toEqual(["overview", "attention", "activity"]);
  });
});

describe("renderableSections", () => {
  it("drops the attention section when it has no items", () => {
    const sections = renderableSections(DASHBOARD_LAYOUTS.employee, 0);
    expect(sectionKinds(sections)).toEqual(["overview", "activity"]);
  });

  it("keeps the attention section when it has items", () => {
    const sections = renderableSections(DASHBOARD_LAYOUTS.employee, 1);
    expect(sectionKinds(sections)).toEqual(["overview", "attention", "activity"]);
  });

  it("renders sections in their declared order", () => {
    const sections = renderableSections(DASHBOARD_LAYOUTS.approver, 1);
    expect(sections.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(sectionKinds(sections)).toEqual(["attention", "overview", "activity"]);
  });

  it("stretches a lone side-by-side slot full width so the grid leaves no empty track", () => {
    const sections = renderableSections(DASHBOARD_LAYOUTS.superadmin, 0);
    expect(sectionKinds(sections)).toEqual(["overview", "activity"]);
    expect(sections[0].className).toContain("lg:col-span-2");
  });

  it("keeps the side-by-side slots when both are present", () => {
    const sections = renderableSections(DASHBOARD_LAYOUTS.superadmin, 2);
    expect(sections[0].className).not.toContain("col-span");
    expect(sections[1].className).not.toContain("col-span");
  });
});
