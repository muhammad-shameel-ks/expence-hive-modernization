import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import styles from "./expenses.module.css";
import { ExpenseDashboard } from "@/features/dashboard/dashboard";
import { claimToExpense } from "@/features/dashboard/expense-read-model";

export default async function ExpensesPage() {
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
          <a className={`${styles.navLink} ${styles.navLinkActive}`} href="/expenses">
            Expenses
          </a>
          <span className={styles.navLink} title="Coming in a later milestone">
            Inbox
          </span>
          <span className={styles.navLink} title="Coming in a later milestone">
            Reports
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

      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Expense operations / dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Expense dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Track every claim from submission to payment — and see exactly who is holding the ball.
        </p>

        <div className="mt-8">
          <ExpenseDashboard currentUser={employee.name} expenses={expenses} />
        </div>
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
