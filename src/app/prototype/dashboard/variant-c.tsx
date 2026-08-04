"use client";

import { HISTORY, ITEMS, ORG_NOTICE } from "./demo-data";
import type { RequestItem } from "./demo-data";
import { StatusChip, TopBar } from "./shared";
import styles from "./variant-c.module.css";

const COLUMNS: {
  key: string;
  label: string;
  hint: string;
  match: (item: RequestItem) => boolean;
}[] = [
  {
    key: "action",
    label: "Needs my action",
    hint: "Decide with evidence beside you",
    match: (item) => item.status === "needs-my-action",
  },
  {
    key: "approval",
    label: "In approval",
    hint: "Waiting on a configured stage",
    match: (item) => item.status === "in-approval",
  },
  {
    key: "exceptions",
    label: "Exceptions",
    hint: "Corrections, takeovers, overruns",
    match: (item) =>
      item.status === "needs-correction" ||
      item.status === "taken-over" ||
      item.status === "overrun",
  },
  {
    key: "done",
    label: "Done",
    hint: "Approved and paid",
    match: (item) => item.status === "approved-and-paid",
  },
];

export default function VariantC() {
  return (
    <main className={styles.page}>
      <TopBar activeNav="home" />

      <div className={styles.body}>
        <p className={styles.eyebrow}>EXPENSE OPERATIONS / BOARD</p>
        <h1 className={styles.title}>
          Request board <span className={styles.accent}>· {CURRENT_USER_FIRST}</span>
        </h1>
        <p className={styles.subtitle}>
          Every request shows one status, one next action, and one owner. Move
          between states without losing context.
        </p>

        <section className={styles.board} aria-label="Requests by state">
          {COLUMNS.map((column) => {
            const items = ITEMS.filter(column.match);
            return (
              <section
                aria-label={`${column.label} (${items.length})`}
                className={styles.column}
                key={column.key}
              >
                <header className={styles.columnHead}>
                  <h2 className={styles.columnTitle}>{column.label}</h2>
                  <span className={styles.columnCount}>{items.length}</span>
                  <p className={styles.columnHint}>{column.hint}</p>
                </header>
                <div className={styles.columnBody}>
                  {items.map((item) => (
                    <BoardCard item={item} key={item.id} />
                  ))}
                  {items.length === 0 && (
                    <p className={styles.columnEmpty}>Nothing here</p>
                  )}
                </div>
              </section>
            );
          })}
        </section>

        <aside className={styles.attention} aria-label="Attention">
          <p className={styles.attentionTag}>{ORG_NOTICE.tag}</p>
          <div>
            <h2 className={styles.attentionTitle}>{ORG_NOTICE.title}</h2>
            <p className={styles.attentionDetail}>{ORG_NOTICE.detail}</p>
          </div>
        </aside>

        <section className={styles.timeline} aria-labelledby="history-heading">
          <div className={styles.sectionHead}>
            <h2 id="history-heading" className={styles.sectionTitle}>
              Recent activity
            </h2>
            <span className={styles.countBadge}>{HISTORY.length}</span>
          </div>
          <ol className={styles.historyList}>
            {HISTORY.map((event, index) => (
              <li className={styles.historyRow} key={index}>
                <span className={styles.historyWhen}>{event.when}</span>
                <span className={styles.historyLine} aria-hidden="true" />
                <div className={styles.historyMain}>
                  <p className={styles.historyAction}>
                    <strong>{event.actor}</strong> {event.action}{" "}
                    <span className={styles.historyRequest}>
                      {event.request}
                    </span>
                  </p>
                  <p className={styles.historyAuthority}>
                    Authority: {event.authority}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

const CURRENT_USER_FIRST = "Ada";

function BoardCard({ item }: { item: RequestItem }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <StatusChip size="lg" status={item.status} />
        {item.urgent && <span className={styles.urgentPill}>URGENT</span>}
      </div>
      <h3 className={styles.cardTitle}>{item.title}</h3>
      <p className={styles.cardMeta}>
        {item.id} · {item.category}
      </p>

      <p className={styles.cardAmount}>{item.amount}</p>

      <dl className={styles.cardFacts}>
        <div>
          <dt>Owner</dt>
          <dd>
            {item.owner}
            {item.isMine ? " (you)" : ""}
          </dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{item.stage}</dd>
        </div>
        <div>
          <dt>Requester</dt>
          <dd>{item.requester}</dd>
        </div>
      </dl>

      {item.blockingReason && (
        <p className={styles.blockingReason}>{item.blockingReason}</p>
      )}

      <p className={styles.nextAction}>
        <span className={styles.nextActionLabel}>Next</span>
        {item.nextAction}
      </p>
    </article>
  );
}
