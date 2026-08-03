import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import styles from "./expenses.module.css";

export default async function ExpensesPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    redirect("/login");
  }

  const firstName = employee.name.split(" ")[0];

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

      <section className={styles.body}>
        <p className={styles.eyebrow}>EXPENSE OPERATIONS / HOME</p>
        <h1 className={styles.title}>
          Welcome back, <span className={styles.accent}>{firstName}</span>.
        </h1>
        <p className={styles.subtitle}>
          You are signed in. Here is what your session looks like.
        </p>

        <div className={styles.grid}>
          <section className={styles.sessionCard} aria-labelledby="session-heading">
            <div className={styles.sessionIcon}>
              <CheckIcon />
            </div>
            <h2 className={styles.cardHeading} id="session-heading">
              Signed in
            </h2>
            <dl className={styles.sessionDetails}>
              <div>
                <dt>Employee</dt>
                <dd>{employee.name}</dd>
              </div>
              <div>
                <dt>Work email</dt>
                <dd>{employee.email}</dd>
              </div>
              <div>
                <dt>Sign-in method</dt>
                <dd>One-time magic link</dd>
              </div>
            </dl>
            <p className={styles.sessionStatus}>
              <span className={styles.statusDot} />
              Session active
            </p>
          </section>

          <section className={styles.nextUp} aria-labelledby="next-heading">
            <h2 className={styles.cardHeading} id="next-heading">
              What comes next
            </h2>
            <ul className={styles.nextList}>
              <li>
                <span className={styles.nextTitle}>Submit an expense</span>
                <span className={styles.nextPill}>Next milestone</span>
              </li>
              <li>
                <span className={styles.nextTitle}>Approval inbox</span>
                <span className={styles.nextPill}>Next milestone</span>
              </li>
              <li>
                <span className={styles.nextTitle}>Reports</span>
                <span className={styles.nextPill}>Next milestone</span>
              </li>
            </ul>
          </section>
        </div>
      </section>
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

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d="m4 10.5 3.5 3.5L16 5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}