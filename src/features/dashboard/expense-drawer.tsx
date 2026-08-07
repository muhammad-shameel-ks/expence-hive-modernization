"use client";
// Right-side expense detail drawer: amount, facts, next action, journey, attachments.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Paperclip, X, type LucideIcon } from "lucide-react";
import { Drawer } from "@/components/motion/drawer";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineItem,
  TimelineSeparator,
  type TimelineTone,
} from "@/components/motion/timeline";
import { Button } from "@/components/ui/button";
import { ReceiptPreview } from "@/features/receipts/receipt-preview";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ME, STATUS_META, type Expense } from "./mock-data";
import { isTerminal, nextActionFor } from "./next-action";
import { KIND_META, formatMoney, initials, statusBadgeClass, submittedLabel } from "./journey-meta";

export interface JourneyFlowStep {
  id: string;
  label: string;
  date: string;
  actor: string;
  detail?: string;
  tone: TimelineTone;
  icon: LucideIcon;
  isCurrent: boolean;
  pending: boolean;
  isMine: boolean;
}

export function getJourneyFlowItems(expense: Expense, currentUser = "", currentUserId?: string): JourneyFlowStep[] {
  const terminal = isTerminal(expense.status);
  const historyKinds = new Set(expense.history.map((h) => h.kind));
  const isMine = (actor: string, actorId?: string) =>
    currentUserId && actorId ? actorId === currentUserId : !!currentUser && actor === currentUser;

  const historySteps: JourneyFlowStep[] = expense.history.map((event, i) => {
    const meta = KIND_META[event.kind];
    const isCurrent = !terminal && i === expense.history.length - 1;
    return {
      id: event.id,
      label: meta.label,
      date: event.date,
      actor: event.actor,
      detail: event.detail,
      tone: meta.tone,
      icon: meta.icon,
      isCurrent,
      pending: false,
      isMine: isMine(event.actor, event.actorId),
    };
  });

  if (terminal) {
    return historySteps;
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
      icon: KIND_META.submitted.icon,
      isCurrent: false,
      pending: true,
      isMine: false,
    });
  }

  if (expense.steps && expense.steps.length > 0) {
    const remaining = expense.steps.filter((s) => s.status === "pending" || s.status === "verified");
    remaining.forEach((step, idx) => {
      const isFinance = step.roleName.toLowerCase().includes("finance") || step.roleName.toLowerCase().includes("treasury");
      pendingSteps.push({
        id: `pending-step-${step.id}`,
        label: step.roleName,
        date: "Pending",
        actor: step.assignedActorName ?? "Pending assignment",
        detail: isFinance ? `Pending ${step.roleName} verification` : `Pending ${step.roleName} decision`,
        tone: isFinance ? "primary" : "success",
        icon: isFinance ? KIND_META.verified.icon : KIND_META.approved.icon,
        isCurrent: idx === 0,
        pending: true,
        isMine: false,
      });
    });

    if (!historyKinds.has("paid") && expense.status !== "rejected") {
      pendingSteps.push({
        id: "pending-payment",
        label: "Paid",
        date: "Pending",
        actor: "Finance / Treasury",
        detail: "Pending payment disbursement",
        tone: "success",
        icon: KIND_META.paid.icon,
        isCurrent: false,
        pending: true,
        isMine: false,
      });
    }

    return [...historySteps, ...pendingSteps];
  }

  const needsApprovalStep =
    expense.status === "in-approval" ||
    expense.status === "submitted" ||
    expense.status === "draft" ||
    (!historyKinds.has("approved") &&
      !historyKinds.has("takeover") &&
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
      tone: "success",
      icon: KIND_META.approved.icon,
      isCurrent: false,
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
      icon: KIND_META.verified.icon,
      isCurrent: false,
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
      tone: "success",
      icon: KIND_META.paid.icon,
      isCurrent: false,
      pending: true,
      isMine: false,
    });
  }

  return [...historySteps, ...pendingSteps];
}

const PRIMARY_ACTION: Record<Expense["status"], string> = {
  draft: "Continue draft",
  submitted: "Withdraw",
  "in-approval": "Remind approver",
  approved: "Add note",
  "in-finance": "Add note",
  paid: "Download summary",
  rejected: "No action available",
};

export function ExpenseDrawer({
  open,
  onOpenChange,
  expense,
  currentUser,
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  currentUser: string;
  currentUserId?: string;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const router = useRouter();

  // Close the inline receipt preview whenever the drawer switches to a
  // different expense so stale documents are never shown. The id is
  // normalized to null so an unselected drawer (expense undefined) does
  // not re-trigger this every render (undefined !== null would loop).
  const currentExpenseId = expense?.id ?? null;
  const [previousExpenseId, setPreviousExpenseId] = useState<string | null>(currentExpenseId);
  if (currentExpenseId !== previousExpenseId) {
    setPreviousExpenseId(currentExpenseId);
    setReceiptOpen(false);
  }

  const statusMeta = expense ? STATUS_META[expense.status] : null;
  const terminal = expense ? isTerminal(expense.status) : false;
  const next = expense ? nextActionFor(expense, currentUser, currentUserId) : null;
  const actionLabel = expense?.primaryAction === "approve"
    ? "Approve claim"
    : expense?.primaryAction === "verify"
      ? "Verify for payment"
      : expense?.primaryAction === "pay"
        ? "Mark as paid"
        : expense
          ? PRIMARY_ACTION[expense.status]
          : "Action";
  // Rejection is only possible while the assigned stage is still pending a
  // decision: once Finance has verified, the step has moved past "pending"
  // and only payment marking remains.
  const canReject =
    !!next?.mine && (expense?.primaryAction === "approve" || expense?.primaryAction === "verify");

  async function performAction() {
    if (!expense?.primaryAction || !next?.mine) return;
    const response = await fetch(`/api/expenses/${expense.id}/${expense.primaryAction}`, { method: "POST" });
    if (response.ok) window.location.reload();
  }

  // Drafts are not routed to any stage: the primary action resumes the
  // receipt-first flow with the draft pre-filled.
  function continueDraft() {
    if (!expense) return;
    router.push(`/expenses/new?id=${encodeURIComponent(expense.id)}`);
  }

  function openDeleteDraft() {
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function performDeleteDraft() {
    if (!expense) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
      if (response.ok) {
        setDeleteOpen(false);
        onOpenChange(false);
        window.location.reload();
        return;
      }
      const body = await response.json().catch(() => null);
      setDeleteError(body?.message ?? "Could not delete this draft.");
    } finally {
      setDeleting(false);
    }
  }

  function openReject() {
    setRejectReason("");
    setRejectError(null);
    setRejectOpen(true);
  }

  async function performReject() {
    if (!expense) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("Enter a reason for rejecting this claim.");
      return;
    }
    setRejecting(true);
    setRejectError(null);
    try {
      const response = await fetch(`/api/expenses/${expense.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const body = await response.json().catch(() => null);
      setRejectError(body?.message ?? "Could not reject this claim.");
    } finally {
      setRejecting(false);
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      ariaLabel={expense ? `Expense details: ${expense.title}` : "Expense details"}
      className="w-full sm:w-[560px] sm:max-w-[94vw]"
    >
      {expense && statusMeta && next ? (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {expense.ref}
              </p>
              <h2 className="mt-1 line-clamp-2 break-words text-lg font-semibold tracking-tight text-foreground">
                {expense.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AnimatedBadge status={statusMeta.tone} size="sm" className={statusBadgeClass(expense.status)}>
                  {statusMeta.label}
                </AnimatedBadge>
                <span className="text-xs text-muted-foreground">{expense.category}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close details"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Amount</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                  {formatMoney(expense.amount, expense.currency)}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Submitted {submittedLabel(expense.submittedAt)}</p>
                <p className="mt-1">
                  {expense.permission ? `Linked to ${expense.permission}` : "No pre-approval"}
                </p>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-border bg-muted/40 p-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Category</dt>
                <dd className="mt-1 font-medium text-foreground">{expense.category}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Current stage</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {expense.nextStage ?? statusMeta.label}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Responsible</dt>
                <dd className="mt-1 flex items-center gap-2 font-medium text-foreground">
                  {expense.nextActor ? (
                    <>
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="bg-primary/10 text-[9px] text-primary">
                          {initials(expense.nextActor)}
                        </AvatarFallback>
                      </Avatar>
                      {expense.nextActor}
                    </>
                  ) : (
                    "None"
                  )}
                </dd>
              </div>
            </dl>

            <section className="mt-6" aria-label="What happens next">
              <h3 className="text-sm font-semibold text-foreground">What happens next</h3>
              {terminal ? (
                <div className="mt-2 rounded-xl border border-border bg-card p-4 text-sm">
                  <p className="text-muted-foreground">
                    {expense.status === "rejected"
                      ? "This claim was rejected and cannot be edited or resubmitted. Submit a new claim if the expense is still valid."
                      : `This expense is ${statusMeta.label.toLowerCase()}. No action is required.`}
                  </p>
                  {expense.status === "rejected" && expense.blockingReason ? (
                    <p className="mt-2 flex gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {expense.blockingReason}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div
                  className={cn(
                    "mt-2 rounded-xl border p-4 text-sm",
                    next.mine
                      ? "border-amber-300/60 bg-amber-50/70"
                      : "border-border bg-card",
                  )}
                >
                  <p className="font-medium text-foreground">{next.label}</p>
                  <p className="mt-1 text-muted-foreground">
                    {next.mine
                      ? "Waiting on you."
                      : `Waiting on ${next.actor ?? "the next approver"}.`}
                  </p>
                  {expense.blockingReason ? (
                    <p className="mt-2 flex gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {expense.blockingReason}
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            <section className="mt-6" aria-label="Expense journey">
              <h3 className="text-sm font-semibold text-foreground">Journey</h3>
              <Timeline position="right" className="mt-4">
                {getJourneyFlowItems(expense, currentUser, currentUserId).map((step) => {
                  const Icon = step.icon;
                  return (
                    <TimelineItem key={step.id} pending={step.pending}>
                      <TimelineSeparator>
                        <TimelineDot tone={step.tone} current={step.isCurrent} pending={step.pending}>
                          <Icon />
                        </TimelineDot>
                      </TimelineSeparator>
                      <TimelineContent>
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                          <div className="flex items-center gap-1.5">
                            <p className={cn("text-sm font-medium", step.pending ? "text-muted-foreground" : "text-foreground")}>
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

            {expense.attachments.length > 0 ? (
              <section className="mt-6" aria-label="Attachments">
                <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {expense.attachments.map((file) => (
                    <li key={file}>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        <Paperclip className="h-3 w-3" />
                        {file}
                      </span>
                    </li>
                  ))}
                </ul>
                {expense.attachmentAvailable !== false ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      aria-expanded={receiptOpen}
                      onClick={() => setReceiptOpen((open) => !open)}
                    >
                      {receiptOpen ? "Hide receipt" : "View receipt"}
                    </Button>
                    {receiptOpen ? (
                      <div className="mt-3">
                        <ReceiptPreview
                          key={expense.id}
                          claimId={expense.id}
                          fileName={expense.attachments[0]}
                        />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}
          </div>

          <footer className="flex items-center gap-3 border-t border-border bg-card px-6 py-4">
            {expense.status === "draft" ? (
              <>
                <Button className="flex-1" onClick={continueDraft}>
                  Continue draft
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="destructive" onClick={openDeleteDraft}>
                  Delete draft
                </Button>
              </>
            ) : (
              <>
                <Button className="flex-1" disabled={!expense.primaryAction || !next.mine} onClick={performAction}>{actionLabel}</Button>
                {canReject ? (
                  <Button variant="destructive" onClick={openReject}>
                    Reject
                  </Button>
                ) : null}
              </>
            )}
            <Button variant="outline" className="gap-1.5">
              Full record
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </footer>
        </>
      ) : null}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this claim</DialogTitle>
            <DialogDescription>
              This is outright and final. The employee cannot edit or resubmit this claim. They would need to
              submit a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="reject-reason" className="text-xs font-medium text-muted-foreground">
              Reason
            </label>
            <textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Explain why this claim is being rejected"
            />
            {rejectError ? <p className="text-xs text-destructive">{rejectError}</p> : null}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={performReject} disabled={rejecting}>
              {rejecting ? "Rejecting…" : "Reject permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>
              This removes the draft and its stored receipt permanently. This cannot be undone. If the expense
              is still valid, start a new claim instead.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-xs text-destructive">{deleteError}</p> : null}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Keep draft
            </Button>
            <Button variant="destructive" onClick={performDeleteDraft} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
}
