"use client";

import { Clock, SkipForward, type LucideIcon } from "lucide-react";
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineItem,
  TimelineSeparator,
  type TimelineTone,
} from "@/components/motion/timeline";
import { cn } from "@/lib/utils";
import { ME, type Expense, type ExpenseStepView } from "./mock-data";
import { isTerminal } from "./next-action";
import { KIND_META, getKindMeta, simplifyAutoSkipDetail } from "./journey-meta";

export interface JourneyFlowStep {
  id: string;
  label: string;
  date: string;
  actor: string;
  detail?: string;
  tone: TimelineTone;
  icon: LucideIcon;
  isCurrent: boolean;
  isNext: boolean;
  pending: boolean;
  isMine: boolean;
}

export function getJourneyFlowItems(
  expense: Expense,
  currentUser = "",
  currentUserId?: string
): JourneyFlowStep[] {
  const terminal = isTerminal(expense.status);
  const historyKinds = new Set(expense.history.map((h) => h.kind));
  const isMine = (actor: string, actorId?: string) =>
    currentUserId && actorId ? actorId === currentUserId : !!currentUser && actor === currentUser;

  // Auto-skips are presented on their stage (see the steps pass below), not
  // as a standalone history entry: the event is written at submission and
  // would otherwise appear before earlier pending stages.
  const nonAutoSkippedHistory = expense.history.filter((event) => event.kind !== "auto-skipped");
  const historySteps: JourneyFlowStep[] = nonAutoSkippedHistory.map((event, i) => {
    const meta = getKindMeta(event.kind);
    const isCurrent = !terminal && i === nonAutoSkippedHistory.length - 1;
    return {
      id: event.id,
      label: meta.label,
      date: event.date,
      actor: event.actor,
      detail: event.detail,
      tone: meta.tone,
      icon: meta.icon,
      isCurrent,
      isNext: false,
      pending: false,
      isMine: isMine(event.actor, event.actorId),
    };
  });

  // An amount-guard auto-skip is a decided stage: it renders between its
  // neighbors in flow order, titled by its role name, with the skip
  // condition as the detail (ADR-0013) - not as a standalone history entry.
  const autoSkipEntry = (step: ExpenseStepView): JourneyFlowStep => ({
    id: `auto-skipped-step-${step.id}`,
    label: step.roleName,
    date: step.decidedAt ?? "Skipped",
    actor: "Policy",
    detail: `Skipped: ${simplifyAutoSkipDetail(step.skipReason ?? "")}`,
    tone: "muted",
    icon: SkipForward,
    isCurrent: false,
    isNext: false,
    pending: false,
    isMine: false,
  });

  const autoSkippedSteps = (expense.steps ?? []).filter((s) => s.status === "skipped" && s.skipReason);

  if (terminal) {
    if (autoSkippedSteps.length === 0) {
      return historySteps;
    }
    // In flow order every approved step maps to an 'approved' history event
    // before the terminal one, so an auto-skip sits right after those
    // approvals. Insert at 1 + (approvals before this step); the leading
    // event is the submission (possibly after a draft-saved event).
    const firstSubmitted = historySteps.findIndex((step) => step.label === KIND_META.submitted.label);
    const insertBase = firstSubmitted >= 0 ? firstSubmitted + 1 : 1;
    const merged = [...historySteps];
    const flowSteps = expense.steps ?? [];
    for (const [index, step] of autoSkippedSteps.entries()) {
      const approvalsBefore = flowSteps
        .slice(0, flowSteps.indexOf(step))
        .filter((s) => s.status === "approved").length;
      merged.splice(insertBase + approvalsBefore + index, 0, autoSkipEntry(step));
    }
    return merged;
  }

  const pendingSteps: JourneyFlowStep[] = [];

  if (expense.status === "draft") {
    pendingSteps.push({
      id: "pending-submission",
      label: "Submission",
      date: "Pending",
      actor: ME,
      detail: "Pending submission",
      tone: "info",
      icon: Clock,
      isCurrent: false,
      isNext: false,
      pending: true,
      isMine: false,
    });
  }

  if (expense.steps && expense.steps.length > 0) {
    // Single pass in flow order: pending/verified stages and amount-guard
    // auto-skips are both stage entries, so a skipped stage stays between
    // the stages before and after it in the flow.
    for (const step of expense.steps) {
      if (step.status === "pending" || step.status === "verified") {
        const isFinance = step.roleName.toLowerCase().includes("finance") || step.roleName.toLowerCase().includes("treasury");
        pendingSteps.push({
          id: `pending-step-${step.id}`,
          label: step.roleName,
          date: "Pending",
          actor: step.assignedActorName ?? "Pending assignment",
          // A verified terminal step is no longer waiting for verification: it
          // is verified and waiting for payment to be marked complete.
          detail:
            step.status === "verified"
              ? "Awaiting payment confirmation"
              : isFinance
                ? `Pending ${step.roleName} verification`
                : `Pending ${step.roleName} decision`,
          tone: step.status === "verified" ? "primary" : isFinance ? "primary" : "warning",
          icon: Clock,
          isCurrent: false,
          isNext: false,
          pending: true,
          isMine: false,
        });
      }

      // An amount-guard auto-skip is a decided stage: it renders in flow order
      // between its neighbors, titled by its role name, with the skip condition
      // as the detail (ADR-0013) - not as a standalone history entry.
      if (step.status === "skipped" && step.skipReason) {
        pendingSteps.push(autoSkipEntry(step));
      }
    }

    if (!historyKinds.has("paid") && expense.status !== "rejected") {
      pendingSteps.push({
        id: "pending-payment",
        label: "Paid",
        date: "Pending",
        actor: "Finance / Treasury",
        detail: "Pending payment disbursement",
        tone: "warning",
        icon: Clock,
        isCurrent: false,
        isNext: false,
        pending: true,
        isMine: false,
      });
    }
  } else {
    const needsApprovalStep =
      expense.status === "in-approval" ||
      expense.status === "submitted" ||
      expense.status === "draft" ||
      (!historyKinds.has("approved") &&
        !historyKinds.has("delegated") &&
        expense.status !== "approved" &&
        expense.status !== "in-finance" &&
        expense.status !== "paid" &&
        expense.status !== "rejected");

    if (needsApprovalStep) {
      pendingSteps.push({
        id: "pending-approval",
        label:
          expense.nextStage && (expense.status === "in-approval" || expense.status === "submitted")
            ? expense.nextStage
            : "Manager approval",
        date: "Pending",
        actor:
          expense.nextActor && (expense.status === "in-approval" || expense.status === "submitted")
            ? expense.nextActor
            : "Approver",
        detail: "Pending approval decision",
        tone: "warning",
        icon: Clock,
        isCurrent: false,
        isNext: false,
        pending: true,
        isMine: false,
      });
    }

    const needsVerificationStep =
      expense.status !== "paid" &&
      expense.status !== "rejected" &&
      (!historyKinds.has("verified") || expense.status === "in-finance");

    if (needsVerificationStep) {
      pendingSteps.push({
        id: "pending-verification",
        label:
          expense.nextStage && expense.status === "in-finance"
            ? expense.nextStage
            : "Finance verification",
        date: "Pending",
        actor:
          expense.nextActor && expense.status === "in-finance"
            ? expense.nextActor
            : "Finance Officer",
        detail: "Pending Finance verification",
        tone: "primary",
        icon: Clock,
        isCurrent: false,
        isNext: false,
        pending: true,
        isMine: false,
      });
    }

    if (!historyKinds.has("paid") && expense.status !== "rejected") {
      pendingSteps.push({
        id: "pending-payment",
        label: "Paid",
        date: "Pending",
        actor: "Finance / Treasury",
        detail: "Pending payment disbursement",
        tone: "warning",
        icon: Clock,
        isCurrent: false,
        isNext: false,
        pending: true,
        isMine: false,
      });
    }
  }

  // The pulse lands on the first *pending* stage, never on a decided stage
  // like an amount-guard auto-skip that precedes it in flow order.
  const firstPending = pendingSteps.findIndex((step) => step.pending);
  if (firstPending >= 0) {
    pendingSteps[firstPending].isNext = true;
  }

  return [...historySteps, ...pendingSteps];
}

export interface JourneyFlowProps {
  expense: Expense;
  currentUser?: string;
  currentUserId?: string;
  className?: string;
  ariaLabel?: string;
  headingLevel?: "h2" | "h3" | "h4";
}

export function JourneyFlow({
  expense,
  currentUser = "",
  currentUserId,
  className,
  ariaLabel = "Expense journey",
  headingLevel: Heading = "h3",
}: JourneyFlowProps) {
  const steps = getJourneyFlowItems(expense, currentUser, currentUserId);

  return (
    <section className={cn("mt-6", className)} aria-label={ariaLabel}>
      <Heading className="text-sm font-semibold text-foreground">Journey</Heading>
      <Timeline position="right" className="mt-4">
        {steps.map((step) => {
          const Icon = step.icon;
          const isPendingStep = step.pending && !step.isNext;
          return (
            <TimelineItem key={step.id} pending={isPendingStep} tone={step.tone}>
              <TimelineSeparator>
                <TimelineDot
                  tone={step.tone}
                  current={step.isCurrent}
                  next={step.isNext}
                  pending={isPendingStep}
                >
                  <Icon />
                </TimelineDot>
              </TimelineSeparator>
              <TimelineContent>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isPendingStep ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {step.label}
                    </p>
                    {step.isMine ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        You
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs tabular-nums text-muted-foreground">{step.date}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.actor}</p>
                {step.detail ? (
                  <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
                ) : null}
              </TimelineContent>
            </TimelineItem>
          );
        })}
      </Timeline>
    </section>
  );
}
