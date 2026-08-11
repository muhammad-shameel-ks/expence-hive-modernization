"use client";
// Right-side expense detail drawer: amount, facts, next action, journey, attachments.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowUpRight, Download, Gavel, Paperclip, X } from "lucide-react";
import { Drawer } from "@/components/motion/drawer";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { EASE_OUT } from "@/lib/ease";
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
import { downloadClaimSummary } from "@/lib/download-claim-summary";
import { STATUS_META, type Expense } from "./mock-data";
import { canTakeOver, isCurrentActor, isTerminal, nextActionFor } from "./next-action";
import { firstPdfAttachment, hasAvailableAttachment, hasAvailablePdf } from "./has-available-pdf";
import { formatMoney, initials, statusBadgeClass, submittedLabel } from "./journey-meta";
import { claimToExpense } from "@/features/dashboard/expense-read-model";
import type { ExpenseClaim, ExpenseEmployee } from "@/server/expenses/ports";
import { JourneyFlow } from "./journey-flow";


const PRIMARY_ACTION: Partial<Record<Expense["status"], string>> = {
  submitted: "Withdraw",
  "in-approval": "Remind approver",
  approved: "Add note",
  "in-finance": "Add note",
};

// Verify/pay mutations return the domain claim plus the organization
// employees ({ claim, employees }), so the drawer renders exactly what the
// server stamped with real actor names - never "System" placeholders.
function resolveUpdatedExpense(body: unknown): Expense | null {
  const payload = (body as { claim?: unknown; employees?: unknown[] } | null) ?? null;
  const claim = payload?.claim;
  if (claim && typeof claim === "object" && "amountMinor" in claim) {
    return claimToExpense(claim as ExpenseClaim, (payload.employees ?? []) as ExpenseEmployee[]);
  }
  return null;
}

export function ExpenseDrawer({
  open,
  onOpenChange,
  expense,
  currentUser,
  currentUserId,
  currentUserRoleId,
  currentUserRoleCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  currentUser: string;
  currentUserId?: string;
  /** Role id of the viewer; the terminal-stage pool gate compares it against the claim's current step role. */
  currentUserRoleId?: string;
  currentUserRoleCode?: string;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [takeoverReason, setTakeoverReason] = useState("");
  const [takingOver, setTakingOver] = useState(false);
  const [takeoverError, setTakeoverError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [navigatingDraft, setNavigatingDraft] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const [overrideExpense, setOverrideExpense] = useState<Expense | null>(null);
  const [showPostVerifyPrompt, setShowPostVerifyPrompt] = useState(false);
  const [payingPrompt, setPayingPrompt] = useState(false);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // True once a successful mutation already ran router.refresh() (e.g. the
  // "Yes, Mark Paid" or "Keep Verified" paths): the queue is then already
  // consistent with the server, so closing the drawer must not refresh a
  // second time.
  const queueSyncedRef = useRef(false);
  // The prompt's focus effect can be deferred past the dismissal commit
  // (concurrent scheduling), re-focusing the prompt after "Keep Verified" or
  // "Yes, Mark Paid" already moved focus to the close button. Re-assert the
  // close button's focus in the dismissal effect, which always runs after the
  // prompt's unmount commit.
  const promptWasShownRef = useRef(false);

  const router = useRouter();
  const reduce = useReducedMotion();

  const activeExpense = overrideExpense ?? expense;

  // Close the inline receipt preview whenever the drawer switches to a
  // different expense so stale documents are never shown. The id is
  // normalized to null so an unselected drawer (expense undefined) does
  // not re-trigger this every render (undefined !== null would loop).
  const currentExpenseId = expense?.id ?? null;
  const [previousExpenseId, setPreviousExpenseId] = useState<string | null>(currentExpenseId);
  if (currentExpenseId !== previousExpenseId) {
    setPreviousExpenseId(currentExpenseId);
    setReceiptOpen(false);
    setActionError(null);
    setOverrideExpense(null);
    setShowPostVerifyPrompt(false);
  }

  useEffect(() => {
    // A switch to a different expense (or a fresh drawer mount) starts a new
    // mutation session: the queue is no longer known to be in sync with the
    // server, so a stale-close refresh must be allowed again.
    queueSyncedRef.current = false;
  }, [currentExpenseId]);

  useEffect(() => {
    if (showPostVerifyPrompt) {
      promptWasShownRef.current = true;
      promptRef.current?.focus();
    } else if (promptWasShownRef.current) {
      closeButtonRef.current?.focus();
    }
  }, [showPostVerifyPrompt]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setActionError(null);
      // Closing without choosing leaves the queue behind stale: refresh it so
      // the drawer never overshadows what the server actually stamped. A
      // successful mutation path already refreshed (queueSyncedRef), so its
      // close is a no-op instead of a redundant second refresh.
      if (overrideExpense && !queueSyncedRef.current) router.refresh();
      queueSyncedRef.current = false;
    }
    onOpenChange(next);
  }

  // Expenses with an available PDF receipt get the two-pane drawer with the
  // receipt auto-mounted on the left; everything else keeps the single
  // column and the manual "View receipt" toggle.
  const pdfAttachment = activeExpense ? firstPdfAttachment(activeExpense.attachments) : undefined;
  const hasPdf = activeExpense ? hasAvailablePdf(activeExpense.attachments, activeExpense.attachmentAvailable) : false;

  const statusMeta = activeExpense ? STATUS_META[activeExpense.status] : null;
  const terminal = activeExpense ? isTerminal(activeExpense.status) : false;
  const next = activeExpense
    ? nextActionFor(activeExpense, currentUser, currentUserId, currentUserRoleId)
    : null;
  const actionLabel = activeExpense?.primaryAction === "approve"
    ? "Approve claim"
    : activeExpense?.primaryAction === "verify"
      ? "Verify for payment"
      : activeExpense?.primaryAction === "pay"
        ? "Mark as paid"
        : activeExpense
          ? PRIMARY_ACTION[activeExpense.status]
          : "Action";
  // Rejection is only possible while the assigned stage is still pending a
  // decision: once Finance has verified, the step has moved past "pending"
  // and only payment marking remains. The server's reject command requires
  // strict assignment (requireAssignedClaim), so unlike the verify/pay pool
  // gate this stays assignment-based even for pool-eligible viewers.
  const canReject =
    !!activeExpense &&
    !!isCurrentActor(activeExpense, currentUser, currentUserId) &&
    (activeExpense.primaryAction === "approve" || activeExpense.primaryAction === "verify");

  // One fetch+error-extraction shape for every drawer mutation: a POST (or
  // DELETE) with a JSON body fallback, surfacing the server's message or a
  // caller-chosen fallback, and a network-failure message on unreachable.
  async function mutate(
    path: string,
    fallbackMessage: string,
    init: RequestInit = { method: "POST" },
  ): Promise<{ ok: boolean; body: unknown; error: string | null }> {
    try {
      const response = await fetch(path, init);
      const body = await response.json().catch(() => null);
      return {
        ok: response.ok,
        body,
        error: response.ok ? null : ((body as { message?: string } | null)?.message ?? fallbackMessage),
      };
    } catch {
      return { ok: false, body: null, error: "Could not reach the server. Check your connection and try again." };
    }
  }

  async function performAction() {
    if (!activeExpense?.primaryAction || !next?.mine || acting) return;
    setActing(true);
    setActionError(null);
    try {
      const result = await mutate(
        `/api/expenses/${activeExpense.id}/${activeExpense.primaryAction}`,
        "The action could not be completed. Please try again."
      );
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      if (activeExpense.primaryAction === "verify") {
        const updated = resolveUpdatedExpense(result.body);
        if (!updated) {
          setActionError("The action could not be completed. Please try again.");
          return;
        }
        setOverrideExpense(updated);
        setShowPostVerifyPrompt(true);
        return;
      }
      if (activeExpense.primaryAction === "pay") {
        const updated = resolveUpdatedExpense(result.body);
        if (!updated) {
          setActionError("The action could not be completed. Please try again.");
          return;
        }
        setOverrideExpense(updated);
        setShowPostVerifyPrompt(false);
        queueSyncedRef.current = true;
        router.refresh();
        return;
      }
      window.location.reload();
    } finally {
      setActing(false);
    }
  }

  // The summary PDF is fetched as bytes (never JSON, unlike the mutations
  // above) and handed to the shared download flow. A failed request or a
  // network failure surfaces in the footer's actionError banner; no file is
  // saved because the download seam only runs after a successful response.
  async function downloadSummary() {
    if (!activeExpense || downloading) return;
    setDownloading(true);
    setActionError(null);
    try {
      const error = await downloadClaimSummary(activeExpense.id, `${activeExpense.ref}-summary.pdf`);
      if (error) setActionError(error);
    } finally {
      setDownloading(false);
    }
  }

  async function handleMarkPaidFromPrompt() {
    if (!activeExpense || payingPrompt) return;
    setPayingPrompt(true);
    setActionError(null);
    try {
      const result = await mutate(
        `/api/expenses/${activeExpense.id}/pay`,
        "The payment action could not be completed. Please try again."
      );
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      const updated = resolveUpdatedExpense(result.body);
      if (!updated) {
        setActionError("The action could not be completed. Please try again.");
        return;
      }
      setOverrideExpense(updated);
      setShowPostVerifyPrompt(false);
      queueSyncedRef.current = true;
      closeButtonRef.current?.focus();
      router.refresh();
    } finally {
      setPayingPrompt(false);
    }
  }

  function handleKeepVerified() {
    setShowPostVerifyPrompt(false);
    queueSyncedRef.current = true;
    closeButtonRef.current?.focus();
    router.refresh();
  }

  // Drafts are not routed to any stage: the primary action resumes the
  // receipt-first flow with the draft pre-filled.
  function continueDraft() {
    if (!activeExpense || navigatingDraft) return;
    setNavigatingDraft(true);
    // Safety net: if navigation is interrupted, the button must not stay
    // stuck in its loading state forever.
    window.setTimeout(() => setNavigatingDraft(false), 3000);
    void router.push(`/expenses/new?id=${encodeURIComponent(activeExpense.id)}`);
  }

  function openDeleteDraft() {
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function performDeleteDraft() {
    if (!activeExpense) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await mutate(
        `/api/expenses/${activeExpense.id}`,
        "Could not delete this draft.",
        { method: "DELETE" }
      );
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      onOpenChange(false);
      window.location.reload();
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
    if (!activeExpense) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("Enter a reason for rejecting this claim.");
      return;
    }
    setRejecting(true);
    setRejectError(null);
    try {
      const result = await mutate(
        `/api/expenses/${activeExpense.id}/reject`,
        "Could not reject this claim.",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      if (result.ok) {
        window.location.reload();
      } else {
        setRejectError(result.error);
      }
    } finally {
      setRejecting(false);
    }
  }

  function openTakeover() {
    setTakeoverReason("");
    setTakeoverError(null);
    setTakeoverOpen(true);
  }

  async function performTakeover() {
    if (!activeExpense) return;
    const reasonCode = takeoverReason.trim();
    if (!reasonCode) {
      setTakeoverError("Enter a justification or reason code for taking over this claim.");
      return;
    }
    setTakingOver(true);
    setTakeoverError(null);
    try {
      const result = await mutate(
        `/api/expenses/${activeExpense.id}/take-over`,
        "Could not take over this claim.",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reasonCode }),
        }
      );
      if (result.ok) {
        const updated = resolveUpdatedExpense(result.body);
        if (updated) {
          setOverrideExpense(updated);
        }
        setTakeoverOpen(false);
        queueSyncedRef.current = true;
        router.refresh();
      } else {
        setTakeoverError(result.error);
      }
    } finally {
      setTakingOver(false);
    }
  }

  // The amount, facts, next action, journey, and attachment chips shared by
  // both layouts. Only the non-PDF layout additionally renders the "View
  // receipt" toggle below the chips.
  const detailsColumn = activeExpense ? (
    <>
      {showPostVerifyPrompt ? (
        <div
          ref={promptRef}
          tabIndex={-1}
          role="region"
          aria-label="Mark payment prompt"
          className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Mark payment as completed now?
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Claim is verified. You can mark payment as complete now or keep it verified.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="default"
                loading={payingPrompt}
                onClick={handleMarkPaidFromPrompt}
              >
                Yes, Mark Paid
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={payingPrompt}
                onClick={handleKeepVerified}
              >
                Keep Verified
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Amount</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {formatMoney(activeExpense.amount, activeExpense.currency)}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Submitted {submittedLabel(activeExpense.submittedAt)}</p>
          <p className="mt-1">
            {activeExpense.permission ? `Linked to ${activeExpense.permission}` : "No pre-approval"}
          </p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Category</dt>
          <dd className="mt-1 font-medium text-foreground">{activeExpense.category}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Current stage</dt>
          <dd className="mt-1 font-medium text-foreground">
            {activeExpense.nextStage ?? statusMeta!.label}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Responsible</dt>
          <dd className="mt-1 flex items-center gap-2 font-medium text-foreground">
            {activeExpense.nextActor ? (
              <>
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="bg-primary/10 text-[9px] text-primary">
                    {initials(activeExpense.nextActor)}
                  </AvatarFallback>
                </Avatar>
                {activeExpense.nextActor}
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
              {activeExpense.status === "rejected"
                ? "This claim was rejected and cannot be edited or resubmitted. Submit a new claim if the expense is still valid."
                : `This expense is ${statusMeta!.label.toLowerCase()}. No action is required.`}
            </p>
            {activeExpense.status === "rejected" && activeExpense.blockingReason ? (
              <p className="mt-2 flex gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {activeExpense.blockingReason}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "mt-2 rounded-xl border p-4 text-sm",
              next!.mine
                ? "border-amber-300/60 bg-amber-50/70"
                : "border-border bg-card",
            )}
          >
            <p className="font-medium text-foreground">{next!.label}</p>
            <p className="mt-1 text-muted-foreground">
              {next!.mine
                ? "Waiting on you."
                : `Waiting on ${next!.actor ?? "the next approver"}.`}
            </p>
            {activeExpense.blockingReason ? (
              <p className="mt-2 flex gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {activeExpense.blockingReason}
              </p>
            ) : null}
          </div>
        )}
      </section>

      <JourneyFlow expense={activeExpense} currentUser={currentUser} currentUserId={currentUserId} />

      {activeExpense.attachments.length > 0 ? (
        <section className="mt-6" aria-label="Attachments">
          <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {activeExpense.attachments.map((file) => (
              <li key={file}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <Paperclip className="h-3 w-3" />
                  {file}
                </span>
              </li>
            ))}
          </ul>
          {!hasPdf && hasAvailableAttachment(activeExpense.attachmentAvailable) ? (
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
                    key={activeExpense.id}
                    claimId={activeExpense.id}
                    fileName={activeExpense.attachments[0]}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  ) : null;

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      side="right"
      ariaLabel={activeExpense ? `Expense details: ${activeExpense.title}` : "Expense details"}
      className={
        hasPdf
          ? "w-full transition-[width] duration-300 ease-out sm:w-[560px] sm:max-w-[94vw] lg:w-[1040px] lg:max-w-[96vw]"
          : "w-full transition-[width] duration-300 ease-out sm:w-[560px] sm:max-w-[94vw]"
      }
    >
      {activeExpense && statusMeta && next ? (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {activeExpense.ref}
              </p>
              <h2 className="mt-1 line-clamp-2 break-words text-lg font-semibold tracking-tight text-foreground">
                {activeExpense.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AnimatedBadge status={statusMeta.tone} size="sm" className={statusBadgeClass(activeExpense.status)}>
                  {statusMeta.label}
                </AnimatedBadge>
                <span className="text-xs text-muted-foreground">{activeExpense.category}</span>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => handleOpenChange(false)}
              aria-label="Close details"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div
            className={cn(
              "flex-1 px-6 py-6",
              hasPdf
                ? "overflow-y-auto lg:flex lg:flex-row lg:gap-5 lg:overflow-hidden"
                : "overflow-y-auto",
            )}
          >
            {hasPdf && pdfAttachment ? (
              <>
                <motion.section
                  aria-label="Receipt preview"
                  initial={reduce ? { opacity: 0 } : { x: 24, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { x: 0, opacity: 1 }}
                  transition={
                    reduce ? { duration: 0.2, ease: EASE_OUT } : { duration: 0.3, ease: EASE_OUT }
                  }
                  className="lg:h-full lg:min-h-0 lg:min-w-0 lg:flex-1"
                >
                  <ReceiptPreview
                    key={activeExpense.id}
                    claimId={activeExpense.id}
                    fileName={pdfAttachment}
                    className="h-[45vh] lg:h-full"
                  />
                </motion.section>
                <div className="lg:h-full lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-y-auto">
                  {detailsColumn}
                </div>
              </>
            ) : (
              detailsColumn
            )}
          </div>

          <footer className="border-t border-border bg-card px-6 py-4">
            {actionError ? (
              <p role="status" className="mb-3 text-xs text-destructive">{actionError}</p>
            ) : null}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              {activeExpense.status === "draft" ? (
                <>
                  <Button className="flex-1" loading={navigatingDraft} onClick={continueDraft}>
                    Continue draft
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="destructive" onClick={openDeleteDraft}>
                    Delete draft
                  </Button>
                  <Button variant="outline" loading={downloading} onClick={downloadSummary}>
                    <Download className="h-3.5 w-3.5" />
                    Download summary
                  </Button>
                </>
              ) : isTerminal(activeExpense.status) ? (
                <Button
                  className="flex-1"
                  loading={downloading}
                  onClick={downloadSummary}
                >
                  Download summary
                </Button>
              ) : (
                <>
                  {!showPostVerifyPrompt ? (
                    <Button
                      className="flex-1"
                      disabled={!activeExpense.primaryAction || !next.mine || acting}
                      loading={acting}
                      onClick={performAction}
                    >
                      {actionLabel}
                    </Button>
                  ) : null}
                  {canReject ? (
                    <Button variant="destructive" onClick={openReject}>
                      Reject
                    </Button>
                  ) : null}
                  {activeExpense && canTakeOver(activeExpense, currentUserId, currentUserRoleCode, currentUserRoleId) ? (
                    <Button
                      variant="outline"
                      className="gap-1.5 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                      onClick={openTakeover}
                    >
                      <Gavel className="h-3.5 w-3.5" />
                      Take over
                    </Button>
                  ) : null}
                  <Button variant="outline" loading={downloading} onClick={downloadSummary}>
                    <Download className="h-3.5 w-3.5" />
                    Download summary
                  </Button>
                </>
              )}
              <Button variant="outline" className="gap-1.5">
                Full record
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </footer>
        </>
      ) : null}

      <Dialog open={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take over this claim</DialogTitle>
            <DialogDescription>
              As a higher-stage approver or Finance Head, taking over this claim waives all pending earlier stages and advances it directly to your stage or terminal Finance.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor="takeover-reason" className="text-xs font-medium text-muted-foreground">
              Reason code / justification
            </label>
            <textarea
              id="takeover-reason"
              value={takeoverReason}
              onChange={(e) => setTakeoverReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Explain why you are taking over this claim (e.g. Manager away on leave / Urgent override)"
            />
            {takeoverError ? <p className="text-xs text-destructive">{takeoverError}</p> : null}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setTakeoverOpen(false)} disabled={takingOver}>
              Cancel
            </Button>
            <Button variant="default" onClick={performTakeover} loading={takingOver}>
              Confirm takeover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
            <Button variant="destructive" onClick={performReject} loading={rejecting}>
              Reject permanently
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
            <Button variant="destructive" onClick={performDeleteDraft} loading={deleting}>
              Delete permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
}
