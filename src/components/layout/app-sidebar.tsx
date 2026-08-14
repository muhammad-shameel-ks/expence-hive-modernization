"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  CheckCircle2,
  Wallet,
  Activity as ActivityIcon,
  ShieldCheck,
} from "lucide-react";
import { resolveRoleCapabilities } from "@/server/shared/authorization";
import type { ExpenseRole } from "@/server/expenses/ports";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export type DashboardPath =
  | "/expenses"
  | "/expenses/all"
  | "/finance/payments"
  | "/finance/activity"
  | "/admin";

export const DASHBOARD_PAGE_LABELS: Record<DashboardPath, string> = {
  "/expenses": "Dashboard",
  "/expenses/all": "My expenses",
  "/finance/payments": "Payment queue",
  "/finance/activity": "Activity",
  "/admin": "Admin console",
};

function activePathFor(pathname: string): DashboardPath | undefined {
  return (Object.keys(DASHBOARD_PAGE_LABELS) as DashboardPath[]).find((path) => path === pathname);
}

export function AppSidebar({ role = null }: { role?: ExpenseRole | null }) {
  const activePath = activePathFor(usePathname());
  const capabilities = resolveRoleCapabilities(role);
  const isApprover = capabilities.canApprove;
  const canViewPaymentQueue = capabilities.canAccessFinance;
  const canViewOrganizationActivity = capabilities.canViewOrganizationActivity;
  const canViewAdminConsole = capabilities.canAccessAdminConsole || activePath === "/admin";
  const showApprovalsGroup = isApprover || canViewPaymentQueue;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-sidebar-border text-primary">
            <HiveMark />
          </span>
          <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <strong className="text-sm font-semibold">ExpenseHive</strong>
            <span className="text-[11px] tracking-wide text-sidebar-foreground/60 uppercase">
              Expense operations
            </span>
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activePath === "/expenses"} tooltip="Dashboard">
                  <a href="/expenses">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={activePath === "/expenses/all"}
                  tooltip="My expenses"
                >
                  <a href="/expenses/all">
                    <ListChecks />
                    <span>My expenses</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showApprovalsGroup ? (
          <SidebarGroup>
            <SidebarGroupLabel>Approvals &amp; finance</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isApprover ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled tooltip="Coming in a later milestone">
                      <CheckCircle2 />
                      <span>Approvals</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
                {canViewPaymentQueue ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={activePath === "/finance/payments"}
                      tooltip="Payment queue"
                    >
                      <a href="/finance/payments">
                        <Wallet />
                        <span>Payment queue</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {canViewOrganizationActivity ? (
          <SidebarGroup>
            <SidebarGroupLabel>Insights</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={activePath === "/finance/activity"}
                    tooltip="Activity"
                  >
                    <a href="/finance/activity">
                      <ActivityIcon />
                      <span>Activity</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {canViewAdminConsole ? (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={activePath === "/admin"} tooltip="Admin console">
                    <a href="/admin">
                      <ShieldCheck />
                      <span>Admin console</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function HiveMark() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" className="size-4">
      <path
        d="m12 2.75 7.5 4.35v9.8L12 21.25l-7.5-4.35V7.1L12 2.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.65"
      />
      <path
        d="m8.25 9.2 3.75-2.15 3.75 2.15v5.6l-3.75 2.15-3.75-2.15V9.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}
