"use client";

import { useState } from "react";
import type { RequestItem, StatusKey } from "./demo-data";
import { CURRENT_USER } from "./demo-data";
import styles from "./shared.module.css";

export function HiveMark() {
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

export function TopBar({ activeNav }: { activeNav: "home" | "expenses" }) {
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
        <span className={styles.prototypePill}>PROTOTYPE</span>
      </div>

      <nav className={styles.nav} aria-label="Workspace">
        <a
          className={`${styles.navLink} ${
            activeNav === "home" ? styles.navLinkActive : ""
          }`}
          href="/prototype/dashboard"
        >
          Home
        </a>
        <a
          className={`${styles.navLink} ${
            activeNav === "expenses" ? styles.navLinkActive : ""
          }`}
          href="/expenses"
        >
          Expenses
        </a>
        <span className={styles.navLink} title="Coming in a later milestone">
          Reports
        </span>
      </nav>

      <div className={styles.account}>
        <span className={styles.avatar} aria-hidden="true">
          {CURRENT_USER.initials}
        </span>
        <span className={styles.accountName}>{CURRENT_USER.name}</span>
      </div>
    </header>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {name.charAt(0)}
    </span>
  );
}

export function KindTag({ kind }: { kind: RequestItem["kind"] }) {
  return (
    <span className={styles.kindTag}>
      {kind === "permission" ? "Permission" : "Reimbursement"}
    </span>
  );
}

export function StatusChip({
  status,
  size = "sm",
}: {
  status: StatusKey;
  size?: "sm" | "lg";
}) {
  return (
    <span className={`${styles.chip} ${styles[`chip_${status}`]} ${size === "lg" ? styles.chipLg : ""}`}>
      <StatusGlyph status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const STATUS_LABEL: Record<StatusKey, string> = {
  "needs-my-action": "Needs my action",
  "in-approval": "In approval",
  "needs-correction": "Needs correction",
  "taken-over": "Taken over",
  overrun: "Amount overrun",
  "approved-and-paid": "Approved and paid",
};

function StatusGlyph({ status }: { status: StatusKey }) {
  switch (status) {
    case "needs-my-action":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <path d="M8 2.75 13.5 13H2.5L8 2.75Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
          <path d="M8 6.5v3.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
          <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
        </svg>
      );
    case "in-approval":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 5v3.25L10.5 10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
        </svg>
      );
    case "needs-correction":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <path d="M4 12h8M5.5 10.5 10.9 5.1a1.6 1.6 0 0 1 2.26 2.26l-5.4 5.4-2.4.6.14-2.36Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
        </svg>
      );
    case "taken-over":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <path d="M4 3.5h4.5M4 12.5h8M3.5 6.5v3L6 11l3-1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
        </svg>
      );
    case "overrun":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 4.5V8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
          <circle cx="8" cy="11.25" r="0.75" fill="currentColor" />
        </svg>
      );
    case "approved-and-paid":
      return (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <path d="m3.25 8.5 3 3 6.5-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        </svg>
      );
  }
}

export function DecisionButtons({ item }: { item: RequestItem }) {
  const [decided, setDecided] = useState<string | null>(null);

  if (decided) {
    return (
      <p className={styles.decidedNote} role="status">
        Prototype only: {decided} recorded for {item.requester}. No data was
        changed.
      </p>
    );
  }

  return (
    <div className={styles.decisions}>
      <div className={styles.decisionCol}>
        <button className={styles.approveBtn} onClick={() => setDecided("Approved")}>
          Approve
        </button>
        <span className={styles.decisionHint}>Advances to the next stage</span>
      </div>
      <div className={styles.decisionCol}>
        <button className={styles.changesBtn} onClick={() => setDecided("Request changes")}>
          Request changes
        </button>
        <span className={styles.decisionHint}>Returns to {item.requester}</span>
      </div>
      <div className={styles.decisionCol}>
        <button className={styles.rejectBtn} onClick={() => setDecided("Rejected")}>
          Reject
        </button>
        <span className={styles.decisionHint}>Closes the request</span>
      </div>
    </div>
  );
}
