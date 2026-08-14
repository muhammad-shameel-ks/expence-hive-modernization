// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExpenseRole } from "@/server/expenses/ports";
import type { RoleCapabilities } from "@/server/shared/authorization";

vi.mock("next/navigation", () => ({
  usePathname: () => "/expenses",
}));

// jsdom doesn't implement matchMedia; the sidebar's mobile-breakpoint hook needs it.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

afterEach(cleanup);

function renderSidebar(role: ExpenseRole | null) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar role={role} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

const roleWithCapabilities = (capabilities: Partial<RoleCapabilities>): ExpenseRole => ({
  id: "role-1",
  code: "custom",
  displayName: "Custom role",
  capabilities: {
    canSubmit: true,
    canApprove: false,
    canAccessFinance: false,
    approveBankDetails: false,
    canViewOrganizationActivity: false,
    canAccessAdminConsole: false,
    ...capabilities,
  },
});

describe("AppSidebar", () => {
  it("always shows the workspace items for a submit-only role", () => {
    renderSidebar(null);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("My expenses")).toBeInTheDocument();
    expect(screen.queryByText("Approvals")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment queue")).not.toBeInTheDocument();
    expect(screen.queryByText("Bank approvals")).not.toBeInTheDocument();
    expect(screen.queryByText("Expense list")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin console")).not.toBeInTheDocument();
  });

  it("shows a working Approvals link for approvers", () => {
    renderSidebar(roleWithCapabilities({ canApprove: true }));
    const approvals = screen.getByText("Approvals").closest("a");
    expect(approvals).toHaveAttribute("href", "/expenses/approvals");
  });

  it("shows Approvals for finance-only capability too", () => {
    renderSidebar(roleWithCapabilities({ canAccessFinance: true }));
    expect(screen.getByText("Approvals")).toBeInTheDocument();
  });

  it("shows Payment queue for finance capability", () => {
    renderSidebar(roleWithCapabilities({ canAccessFinance: true }));
    expect(screen.getByText("Payment queue")).toBeInTheDocument();
  });

  it("shows Bank approvals for the approveBankDetails capability", () => {
    renderSidebar(roleWithCapabilities({ approveBankDetails: true }));
    const bankApprovals = screen.getByText("Bank approvals").closest("a");
    expect(bankApprovals).toHaveAttribute("href", "/finance/bank-details");
  });

  it("shows Expense list and Activity for organization activity capability", () => {
    renderSidebar(roleWithCapabilities({ canViewOrganizationActivity: true }));
    expect(screen.getByText("Expense list")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("shows Admin console for admin console capability", () => {
    renderSidebar(roleWithCapabilities({ canAccessAdminConsole: true }));
    expect(screen.getByText("Admin console")).toBeInTheDocument();
  });
});
