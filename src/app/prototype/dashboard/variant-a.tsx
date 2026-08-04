"use client";

import type { RequestItem } from "./demo-data";
import { CURRENT_USER, ITEMS, ORG_NOTICE, STATUS_META } from "./demo-data";
import {
  Avatar,
  DecisionButtons,
  KindTag,
  StatusChip,
  TopBar,
} from "./shared";
import styles from "./variant-a.module.css";

export default function VariantA() {
  const myItems = ITEMS.filter((item) => item.isMine);
  const needsAction = ITEMS.filter((item) => item.status === "needs-my-action");

  const stats = [
    { label: "Needs your action", value: needsAction.length, tone: "blue" },
    { label: "In approval", value: ITEMS.filter((i) => i.status === "in-approval").length, tone: "slate" },
    { label: "Needs correction", value: ITEMS.filter((i) => i.status === "needs-correction").length, tone: "amber" },
    { label: "Approved and paid", value: ITEMS.filter((i) => i.status === "approved-and-paid").length, tone: "green" },
  ];

  return (
    <main className={styles.page}>
      <TopBar activeNav="home" />

      <div className={styles.body}>
        <p className={styles.eyebrow}>EXPENSE OPERATIONS / HOME</p>
        <h1 className={styles.title}>
          Good morning, <span className={styles.accent}>{CURRENT_USER.name.split(" ")[0]}</span>.
        </h1>
        <p className={styles.subtitle}>
          Two requests need your decision today. Everything else is waiting or
          settled.
        </p>

        <section className={styles.stats} aria-label="Summary">
          {stats.map((stat) => (
            <div className={styles.statTile} key={stat.label}>
              <span className={`${styles.statDot} ${styles[`statDot_${stat.tone}`]}`} />
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </div>
          ))}
        </section>

        <section aria-labelledby="action-heading">
          <div className={styles.sectionHead}>
            <h2 id="action-heading" className={styles.sectionTitle}>
              Needs your action
            </h2>
            <span className={styles.countBadge}>{needsAction.length}</span>
          </div>

          <div className={styles.actionStack}>
            {needsAction.map((item) => (
              <ActionCard item={item} key={item.id} />
            ))}
          </div>
        </section>

        <section aria-labelledby="requests-heading" className={styles.mySection}>
          <div className={styles.sectionHead}>
            <h2 id="requests-heading" className={styles.sectionTitle}>
              Your requests
            </h2>
            <span className={styles.countBadge}>{myItems.length}</span>
          </div>

          <ul className={styles.myList}>
            {myItems.map((item) => (
              <li className={styles.myRow} key={item.id}>
                <StatusChip status={item.status} />
                <div className={styles.myMain}>
                  <p className={styles.myTitle}>
                    {item.title} <span className={styles.myId}>{item.id}</span>
                  </p>
                  <p className={styles.myMeta}>
                    {STATUS_META[item.status].label} · {item.stage} · with{" "}
                    {item.owner}
                  </p>
                  {item.blockingReason && (
                    <p className={styles.blockingReason}>
                      {item.blockingReason}
                    </p>
                  )}
                  <p className={styles.nextAction}>
                    Next: {item.nextAction}
                  </p>
                </div>
                <span className={styles.myAmount}>{item.amount}</span>
              </li>
            ))}
          </ul>
        </section>

        <aside className={styles.attention} aria-label="Attention">
          <p className={styles.attentionTag}>{ORG_NOTICE.tag}</p>
          <div>
            <h2 className={styles.attentionTitle}>{ORG_NOTICE.title}</h2>
            <p className={styles.attentionDetail}>{ORG_NOTICE.detail}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ActionCard({ item }: { item: RequestItem }) {
  return (
    <article className={styles.actionCard}>
      <div className={styles.cardTop}>
        <div className={styles.requester}>
          <Avatar name={item.requester} />
          <div>
            <p className={styles.requesterName}>{item.requester}</p>
            <p className={styles.requesterMeta}>
              {item.submittedOn}
              {item.due ? ` · ${item.due}` : ""}
            </p>
          </div>
        </div>
        <div className={styles.cardTags}>
          <KindTag kind={item.kind} />
          {item.urgent && <span className={styles.urgentPill}>URGENT</span>}
        </div>
      </div>

      <div className={styles.cardMain}>
        <div>
          <h3 className={styles.cardTitle}>{item.title}</h3>
          <p className={styles.cardMeta}>
            {item.category} · {item.stage} · with {item.owner}
          </p>
        </div>
        <span className={styles.cardAmount}>{item.amount}</span>
      </div>

      {item.policyNote && <p className={styles.policyNote}>{item.policyNote}</p>}

      <div className={styles.evidenceRow}>
        {item.receiptCount && (
          <span className={styles.evidenceChip}>
            {item.receiptCount} receipt{item.receiptCount === 1 ? "" : "s"}
          </span>
        )}
        {item.linkedPermission && (
          <span className={styles.evidenceChip}>
            Linked permission {item.linkedPermission}
          </span>
        )}
        <span className={styles.evidenceChip}>Full history available</span>
      </div>

      <DecisionButtons item={item} />
    </article>
  );
}
