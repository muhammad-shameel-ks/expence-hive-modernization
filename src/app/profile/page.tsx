import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { profileCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { AppHeader } from "@/components/layout/app-header";
import { ProfilePage } from "@/features/profile/profile-page";
import styles from "../expenses/expenses.module.css";

export default async function ProfileRoute() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) redirect("/login");

  let profile;
  try {
    profile = await profileCommands().getProfile(employee.id);
  } catch (error) {
    // A deactivated employee still holds a session but is rejected by the
    // expense domain; send them back to sign-in instead of crashing.
    if (isExpenseError(error) && error.code === "unauthorized") {
      redirect("/login");
    }
    throw error;
  }

  return (
    <main className={styles.page}>
      <AppHeader
        employeeName={profile.employee.name}
        role={profile.employee.role}
        activePath="/profile"
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Profile / personal details
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Profile
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          How the system sees you, your contact details, and the bank account reimbursements are
          paid to.
        </p>

        <div className="mt-8">
          <ProfilePage initialProfile={profile} />
        </div>
      </div>
    </main>
  );
}
