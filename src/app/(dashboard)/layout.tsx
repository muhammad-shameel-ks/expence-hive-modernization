import { redirect } from "next/navigation";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { requireSessionEmployee } from "@/server/shared/session";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const employee = await requireSessionEmployee();

  let workspace;
  try {
    workspace = await expenseCommands().getWorkspace(employee.id);
  } catch (error) {
    // A deactivated employee still holds a session but is rejected by the
    // expense domain; send them back to sign-in instead of crashing.
    if (isExpenseError(error) && error.code === "unauthorized") {
      redirect("/login");
    }
    throw error;
  }

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
