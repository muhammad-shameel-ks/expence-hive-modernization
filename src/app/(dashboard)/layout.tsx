import { getWorkspaceOrRedirect, requireSessionEmployee } from "@/server/shared/session";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const employee = await requireSessionEmployee();
  const workspace = await getWorkspaceOrRedirect(employee.id);

  return (
    <SidebarProvider>
      <AppSidebar role={workspace.employee.role} />
      <SidebarInset>
        <AppTopbar employeeName={workspace.employee.name} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
