import type { ExpenseRoleCode } from "@/server/expenses/ports";
import styles from "@/app/expenses/expenses.module.css";

const APPROVER_ROLES: ExpenseRoleCode[] = ["manager", "it-reviewer", "finance-reviewer", "ceo"];

export function AppHeader({
  employeeName,
  roleCodes = [],
  activePath,
}: {
  employeeName: string;
  roleCodes?: ExpenseRoleCode[];
  activePath?: "/expenses" | "/expenses/all";
}) {
  const isApprover = roleCodes.some((role) => APPROVER_ROLES.includes(role));

  return (
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
        <a
          className={`${styles.navLink} ${activePath === "/expenses" ? styles.navLinkActive : ""}`}
          href="/expenses"
        >
          Dashboard
        </a>
        <a
          className={`${styles.navLink} ${activePath === "/expenses/all" ? styles.navLinkActive : ""}`}
          href="/expenses/all"
        >
          Expenses
        </a>
        {isApprover ? (
          <span className={styles.navLink} title="Coming in a later milestone">
            Approvals
          </span>
        ) : null}
      </nav>

      <div className={styles.account}>
        <span className={styles.avatar} aria-hidden="true">
          {employeeName.charAt(0)}
        </span>
        <span className={styles.accountName}>{employeeName}</span>
        <form action="/api/auth/logout" method="post">
          <button className={styles.signOut} type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
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
