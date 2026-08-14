// Role-specific dashboard card sets (ADR-0020): display-only mapping from
// the server-computed aggregates (dashboard-read-models.ts) to the four-card
// grid. Money math stays server-side; these modules only pick labels,
// formatted values, hint copy (with per-card empty states), and task CTAs.

import type {
  ApproverAggregates,
  EmployeeAggregates,
  FinanceAggregates,
} from "@/server/expenses/dashboard-read-models";
import { formatMoney } from "./journey-meta";

export interface StatCardAction {
  label: string;
  /** A navigation CTA, e.g. the finance queue card linking to the queue page. */
  href?: string;
  /** An in-page CTA, e.g. opening the drawer on a draft or an aged claim. */
  onClick?: () => void;
}

export interface StatCard {
  label: string;
  /** Fully formatted display value, e.g. "₹594.00" or "4". */
  value: string;
  /** Supporting copy; when the card has nothing to show it becomes the empty-state hint. */
  hint: string;
  /** The card's task CTA; only rendered when the card has something to act on. */
  action?: StatCardAction;
}

const noun = (count: number, singular: string, plural: string): string =>
  count === 1 ? singular : plural;

export function employeeStatCards(
  cards: EmployeeAggregates,
  periodLabel: string,
  actions: { onResumeDraft: () => void },
): StatCard[] {
  const lowerPeriod = periodLabel.toLowerCase();
  return [
    {
      label: `Spent ${periodLabel}`,
      value: formatMoney(cards.spentMinor / 100),
      hint:
        cards.spentCount > 0
          ? `${cards.spentCount} ${noun(cards.spentCount, "expense", "expenses")}`
          : `Nothing spent ${lowerPeriod}`,
    },
    {
      label: "Pending reimbursements",
      value: formatMoney(cards.pendingMinor / 100),
      hint:
        cards.pendingCount > 0
          ? `${cards.pendingCount} ${noun(cards.pendingCount, "claim", "claims")} awaiting payment`
          : "Nothing awaiting payment",
    },
    {
      label: "Drafts",
      value: String(cards.draftsCount),
      hint:
        cards.draftsCount > 0
          ? "Resume drafting from the list below"
          : "No drafts yet - submit a new claim",
      action:
        cards.draftsCount > 0
          ? { label: "Resume draft", onClick: actions.onResumeDraft }
          : undefined,
    },
    {
      label: `Reimbursed ${periodLabel}`,
      value: formatMoney(cards.reimbursedMinor / 100),
      hint:
        cards.reimbursedCount > 0
          ? `${cards.reimbursedCount} ${noun(cards.reimbursedCount, "payment", "payments")} received`
          : `Nothing reimbursed ${lowerPeriod}`,
    },
  ];
}

export function approverStatCards(
  cards: ApproverAggregates,
  absenceTimeoutDays: number,
  actions: { onReviewAged: () => void },
): StatCard[] {
  return [
    {
      label: "Awaiting my action",
      value: formatMoney(cards.awaitingMyActionTotalMinor / 100),
      hint:
        cards.awaitingMyActionCount > 0
          ? `${cards.awaitingMyActionCount} ${noun(cards.awaitingMyActionCount, "claim", "claims")} need a decision`
          : "Nothing needs your decision",
      action: cards.awaitingMyActionCount > 0 ? { label: "Review all", href: "/expenses/approvals" } : undefined,
    },
    {
      label: "Aging",
      value: String(cards.agedCount),
      hint:
        cards.agedCount > 0
          ? `Stuck beyond the ${absenceTimeoutDays}-day timeout`
          : `Nothing past the ${absenceTimeoutDays}-day timeout`,
      action: cards.agedCount > 0 ? { label: "Review oldest", onClick: actions.onReviewAged } : undefined,
    },
  ];
}

export function financeStatCards(
  cards: FinanceAggregates,
  periodLabel: string,
  absenceTimeoutDays: number,
  actions: { onReviewAged: () => void },
): StatCard[] {
  const lowerPeriod = periodLabel.toLowerCase();
  return [
    {
      label: "Queue backlog",
      value: formatMoney(cards.queueTotalMinor / 100),
      hint:
        cards.queueCount > 0
          ? `${cards.queueCount} ${noun(cards.queueCount, "claim", "claims")} awaiting verification or payment`
          : "Queue is clear",
      action: { label: "Open queue", href: "/finance/payments" },
    },
    {
      label: `Paid out ${periodLabel}`,
      value: formatMoney(cards.paidOutMinor / 100),
      hint:
        cards.paidOutCount > 0
          ? `${cards.paidOutCount} ${noun(cards.paidOutCount, "claim", "claims")} paid`
          : `Nothing paid out ${lowerPeriod}`,
    },
    {
      label: "Aged claims",
      value: String(cards.agedCount),
      hint:
        cards.agedCount > 0
          ? `Stuck beyond the ${absenceTimeoutDays}-day timeout`
          : `Nothing past the ${absenceTimeoutDays}-day timeout`,
      action: cards.agedCount > 0 ? { label: "Review oldest", onClick: actions.onReviewAged } : undefined,
    },
    {
      label: `Rejected ${periodLabel}`,
      value: String(cards.rejectedCount),
      hint:
        cards.rejectedCount > 0
          ? `${formatMoney(cards.rejectedTotalMinor / 100)} rejected`
          : `Nothing rejected ${lowerPeriod}`,
    },
  ];
}
