import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import styles from "../expenses.module.css";
import { AllExpensesView } from "@/features/dashboard/all-expenses-view";
import { claimToExpense } from "@/features/dashboard/expense-read-model";

export default async function AllExpensesPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    redirect("/login");
  }
  const workspace = await expenseCommands().getWorkspace(employee.id);
  const expenses = workspace.claims.map((claim) => claimToExpense(claim, workspace.employees));

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <HiveMark />
          </span>
          <span>
            <strong className={styles.brandName}>ExpenseHive</strong>
            <span className={styles.brandDescriptor}>expense operations</span>
          </span>
        </div>

        <nav className={styles.nav} aria-label="Workspace">
          <a className={styles.navLink} href="/expenses">
            Dashboard
          </a>
          <a className={`${styles.navLink} ${styles.navLinkActive}`} href="/expenses/all">
            All Expenses
          </a>
          <span className={styles.navLink} title="Coming in a later milestone">
            Inbox
          </span>
        </nav>

        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">
            {employee.name.charAt(0)}
          </span>
          <span className={styles.accountName}>{employee.name}</span>
          <form action="/api/auth/logout" method="post">
            <button className={styles.signOut} type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 pb-32 sm:px-6 lg:px-10">
        <AllExpensesView currentUser={employee.name} expenses={expenses} />
      </div>
    </main>
  );
}

function HiveMark() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
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
