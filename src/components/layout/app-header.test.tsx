// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppHeader } from "./app-header";
import type { ExpenseRole } from "@/server/expenses/ports";

const MANAGER_ROLE: ExpenseRole = {
  id: "role-mgr",
  code: "manager",
  displayName: "Manager",
  capabilities: {
    canSubmit: true,
    canApprove: true,
    canAccessFinance: false,
    approveBankDetails: false,
    canViewOrganizationActivity: false,
    canAccessAdminConsole: false,
  },
};

const EXECUTIVE_ROLE: ExpenseRole = {
  id: "role-exec",
  code: "executive",
  displayName: "Executive",
  capabilities: {
    canSubmit: true,
    canApprove: false,
    canAccessFinance: false,
    approveBankDetails: false,
    canViewOrganizationActivity: false,
    canAccessAdminConsole: false,
  },
};

const FINANCE_HEAD_ROLE: ExpenseRole = {
  id: "role-fh",
  code: "finance-head",
  displayName: "Finance Head",
  capabilities: {
    canSubmit: true,
    canApprove: false,
    canAccessFinance: true,
    approveBankDetails: true,
    canViewOrganizationActivity: true,
    canAccessAdminConsole: false,
  },
};

afterEach(() => {
  cleanup();
});

describe("AppHeader", () => {
  it("renders Approvals link for a Manager", () => {
    render(<AppHeader employeeName="Ada Lovelace" role={MANAGER_ROLE} activePath="/expenses/approvals" />);
    const link = screen.getByRole("link", { name: "Approvals" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/expenses/approvals");
  });

  it("renders Approvals link for a Finance Head", () => {
    render(<AppHeader employeeName="Pramod" role={FINANCE_HEAD_ROLE} />);
    const link = screen.getByRole("link", { name: "Approvals" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/expenses/approvals");
  });

  it("does not render Approvals link for an Executive", () => {
    render(<AppHeader employeeName="Muhammad Shameel" role={EXECUTIVE_ROLE} />);
    expect(screen.queryByRole("link", { name: "Approvals" })).not.toBeInTheDocument();
    expect(screen.queryByText("Approvals")).not.toBeInTheDocument();
  });
});
