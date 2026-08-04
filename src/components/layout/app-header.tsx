import styles from "@/app/expenses/expenses.module.css";

export function AppHeader({ employeeName }: { employeeName: string }) {
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
