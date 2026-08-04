"use client";

import { useState } from "react";
import { CURRENT_USER, ITEMS, STATUS_META } from "./demo-data";
import type { RequestItem } from "./demo-data";
import { Avatar, DecisionButtons, HiveMark, KindTag, StatusChip } from "./shared";
import styles from "./variant-b.module.css";

type TabKey = "action" | "waiting" | "completed";

const TABS: { key: TabKey; label: string }[] = [
  { key: "action", label: "Needs my action" },
  { key: "waiting", label: "Waiting" },
  { key: "completed", label: "Completed" },
];

export default function VariantB() {
  const [tab, setTab] = useState<TabKey>("action");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = ITEMS.filter((item) => {
    const inTab =
      tab === "action"
        ? item.status === "needs-my-action"
        : tab === "completed"
          ? item.status === "approved-and-paid"
          : item.status !== "needs-my-action" &&
            item.status !== "approved-and-paid";
    if (!inTab) return false;
    if (!query.trim()) return true;
    const haystack = `${item.title} ${item.requester} ${item.id}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const counts: Record<TabKey, number> = {
    action: ITEMS.filter((i) => i.status === "needs-my-action").length,
    waiting: ITEMS.filter(
      (i) =>
        i.status !== "needs-my-action" && i.status !== "approved-and-paid",
    ).length,
    completed: ITEMS.filter((i) => i.status === "approved-and-paid").length,
  };

  const myRequests = ITEMS.filter((item) => item.isMine);

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <span className={styles.sidebarMark}>
            <HiveMark />
          </span>
          <div>
            <strong className={styles.sidebarName}>ExpenseHive</strong>
            <span className={styles.sidebarDescriptor}>
              expense operations
            </span>
          </div>
        </div>

        <nav className={styles.sidebarNav} aria-label="Workspace">
          <a className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`} href="/prototype/dashboard">
            Home
          </a>
          <span className={styles.sidebarLink}>
            Inbox
            <span className={styles.sidebarBadge}>{counts.action}</span>
          </span>
          <a className={styles.sidebarLink} href="/expenses">
            Expenses
          </a>
          <span className={styles.sidebarLink} title="Coming in a later milestone">
            Reports
          </span>
          <span className={styles.sidebarLink} title="Coming in a later milestone">
            Workflows
          </span>
        </nav>

        <div className={styles.sidebarUser}>
          <Avatar name={CURRENT_USER.name} />
          <div>
            <p className={styles.sidebarUserName}>{CURRENT_USER.name}</p>
            <p className={styles.sidebarUserRole}>{CURRENT_USER.role}</p>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.mainHeader}>
          <div>
            <p className={styles.eyebrow}>EXPENSE OPERATIONS / INBOX</p>
            <h1 className={styles.title}>Approval inbox</h1>
            <p className={styles.subtitle}>
              Decisions with the evidence beside them. Defaults to work that
              needs you.
            </p>
          </div>
          <div className={styles.searchWrap}>
            <label className={styles.srOnly} htmlFor="inbox-search">
              Search requests
            </label>
            <input
              className={styles.search}
              id="inbox-search"
              placeholder="Search requests…"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Inbox sections">
          {TABS.map(({ key, label }) => (
            <button
              aria-selected={tab === key}
              className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
              key={key}
              role="tab"
              onClick={() => {
                setTab(key);
                setExpandedId(null);
              }}
            >
              {label}
              <span className={styles.tabCount}>{counts[key]}</span>
            </button>
          ))}
        </div>

        <section className={styles.table} aria-label="Requests">
          <div className={styles.tableHead} aria-hidden="true">
            <span>Requester</span>
            <span>Request</span>
            <span>Amount</span>
            <span>Submitted</span>
            <span>Status</span>
            <span />
          </div>
          {rows.length === 0 ? (
            <p className={styles.empty}>No requests match this view.</p>
          ) : (
            rows.map((item) => (
              <InboxRow
                item={item}
                key={item.id}
                open={expandedId === item.id}
                onToggle={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
              />
            ))
          )}
        </section>

        <section className={styles.myRequests} aria-labelledby="my-heading">
          <div className={styles.sectionHead}>
            <h2 id="my-heading" className={styles.sectionTitle}>
              Your requests
            </h2>
            <span className={styles.countBadge}>{myRequests.length}</span>
          </div>
          <ul className={styles.myList}>
            {myRequests.map((item) => (
              <li className={styles.myRow} key={item.id}>
                <StatusChip status={item.status} />
                <div className={styles.myMain}>
                  <p className={styles.myTitle}>
                    {item.title} <span className={styles.myId}>{item.id}</span>
                  </p>
                  <p className={styles.myMeta}>
                    {STATUS_META[item.status].label} · with {item.owner}
                  </p>
                </div>
                <span className={styles.myAmount}>{item.amount}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function InboxRow({
  item,
  open,
  onToggle,
}: {
  item: RequestItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.rowWrap}>
      <button
        aria-expanded={open}
        className={styles.row}
        onClick={onToggle}
        type="button"
      >
        <span className={styles.rowRequester}>
          <Avatar name={item.requester} />
          <span>{item.requester}</span>
        </span>
        <span className={styles.rowTitleWrap}>
          <span className={styles.rowTitle}>{item.title}</span>
          <span className={styles.rowKind}>
            <KindTag kind={item.kind} /> {item.category}
          </span>
        </span>
        <span className={styles.rowAmount}>{item.amount}</span>
        <span className={styles.rowSubmitted}>
          {item.submittedOn}
          {item.due ? ` · ${item.due}` : ""}
        </span>
        <span className={styles.rowStatus}>
          <StatusChip status={item.status} />
        </span>
        <span className={styles.rowAction}>
          {open ? "Close" : item.status === "needs-my-action" ? "Review" : "View"}
        </span>
      </button>

      {open && (
        <div className={styles.detail}>
          <div className={styles.detailGrid}>
            <div className={styles.detailCol}>
              <h3 className={styles.detailHeading}>Evidence</h3>
              <dl className={styles.detailList}>
                <div>
                  <dt>Stage</dt>
                  <dd>{item.stage}</dd>
                </div>
                <div>
                  <dt>Current owner</dt>
                  <dd>{item.owner}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{item.category}</dd>
                </div>
                <div>
                  <dt>Linked permission</dt>
                  <dd>{item.linkedPermission ?? "None"}</dd>
                </div>
                <div>
                  <dt>Receipts</dt>
                  <dd>{item.receiptCount ?? 0} attached</dd>
                </div>
              </dl>
              {item.policyNote && (
                <p className={styles.policyNote}>{item.policyNote}</p>
              )}
              {item.blockingReason && (
                <p className={styles.blockingReason}>{item.blockingReason}</p>
              )}
            </div>
            <div className={styles.detailCol}>
              <h3 className={styles.detailHeading}>History</h3>
              <ol className={styles.historyList}>
                <li>
                  <span className={styles.historyWhen}>Jul 30</span>
                  <span className={styles.historyText}>
                    Submitted by {item.requester}
                  </span>
                </li>
                <li>
                  <span className={styles.historyWhen}>Jul 31</span>
                  <span className={styles.historyText}>
                    Approved by Dorothy Vaughan · Reporting Head
                  </span>
                </li>
                <li>
                  <span className={styles.historyWhen}>Aug 1</span>
                  <span className={styles.historyText}>
                    Arrived at {item.stage}
                  </span>
                </li>
              </ol>
            </div>
          </div>

          {item.status === "needs-my-action" && (
            <div className={styles.detailDecide}>
              <h3 className={styles.detailHeading}>Your decision</h3>
              <DecisionButtons item={item} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
