"use client";

import { useState } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingBankDetailChange } from "@/server/expenses/profile";

// The finance approval surface for bank-detail change requests (ADR-0024):
// pending requests list the currently approved account and the requested
// one side by side, with approve and reject actions. Self-approval is
// hidden here and refused server-side. Every action is a plain button or a
// labeled textarea, so the surface stays keyboard accessible (WCAG 2.2 AA).

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#8a96a8]">{label}</dt>
      <dd className="font-semibold text-[#33445c]">{value}</dd>
    </div>
  );
}

export function BankDetailApprovals({
  currentUserId,
  initialRequests,
}: {
  currentUserId: string;
  initialRequests: PendingBankDetailChange[];
}) {
  const [requests, setRequests] = useState<PendingBankDetailChange[]>(initialRequests);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = async (): Promise<PendingBankDetailChange[]> => {
    const response = await fetch("/api/finance/bank-detail-requests", { cache: "no-store" });
    if (!response.ok) throw new Error("requests-read");
    const body = (await response.json()) as { requests: PendingBankDetailChange[] };
    return body.requests;
  };

  const approve = async (requestId: string) => {
    setActingId(requestId);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/finance/bank-detail-requests/${requestId}/approve`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "unknown");
      }
      setRequests(await refresh());
      setMessage("Bank-details change approved; the new account is now active.");
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "requests-read"
          ? caught.message
          : "The approval could not be saved. Please try again.",
      );
    } finally {
      setActingId(null);
    }
  };

  const confirmReject = async (requestId: string) => {
    setActingId(requestId);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/finance/bank-detail-requests/${requestId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "unknown");
      }
      setRejectingId(null);
      setRejectReason("");
      setRequests(await refresh());
      setMessage("Bank-details change rejected; the current account stays active.");
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "requests-read"
          ? caught.message
          : "The rejection could not be saved. Please try again.",
      );
    } finally {
      setActingId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="space-y-5">
        <p className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 text-sm text-[#7d8a9b] shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
          No pending bank-detail change requests.
        </p>
        <StatusBanner message={message} error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {requests.map((request) => {
        const isOwn = request.requesterId === currentUserId;
        return (
          <section
            key={request.id}
            aria-label={`Bank-details change from ${request.requesterName}`}
            className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#33445c]">{request.requesterName}</span>
              {request.requesterRole ? (
                <span className="rounded-full bg-[#eaf3f6] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#196d86]">
                  {request.requesterRole}
                </span>
              ) : null}
              <span className="text-[#8a96a8]">Requested {formatDate(request.requestedAt)}</span>
              {isOwn ? (
                <span
                  className="flex items-center gap-1 rounded-full bg-[#fdf0f2] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#a8384d]"
                  role="note"
                >
                  <ShieldAlert className="size-3" /> Your own change - cannot be decided by you
                </span>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
              <div className="rounded-xl border border-[#eef2f6] bg-[#fafbfc] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]">
                  Current account
                </p>
                {request.currentApproved ? (
                  <dl className="mt-2 space-y-1.5 text-xs text-[#526278]">
                    <DetailRow label="Holder" value={request.currentApproved.holderName} />
                    <DetailRow label="Account" value={request.currentApproved.accountNumber} />
                    <DetailRow label="IFSC" value={request.currentApproved.ifsc} />
                    <DetailRow
                      label="Bank"
                      value={`${request.currentApproved.bankName}, ${request.currentApproved.branch}`}
                    />
                  </dl>
                ) : (
                  <p className="mt-2 text-xs text-[#a8384d]">
                    No approved account yet. This is the employee&apos;s first request.
                  </p>
                )}
              </div>

              <div className="hidden md:block" aria-hidden="true">
                <ArrowRight className="mt-6 size-4 text-[#8a96a8]" />
              </div>

              <div className="rounded-xl border border-[#dce9ef] bg-[#f2f8fb] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#196d86]">
                  Requested account
                </p>
                <dl className="mt-2 space-y-1.5 text-xs text-[#526278]">
                  <DetailRow label="Holder" value={request.requested.holderName} />
                  <DetailRow label="Account" value={request.requested.accountNumber} />
                  <DetailRow label="IFSC" value={request.requested.ifsc} />
                  <DetailRow
                    label="Bank"
                    value={`${request.requested.bankName}, ${request.requested.branch}`}
                  />
                </dl>
              </div>
            </div>

            {isOwn ? null : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  disabled={actingId === request.id}
                  onClick={() => approve(request.id)}
                >
                  Approve change
                </Button>
                {rejectingId === request.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`reject-reason-${request.id}`} className="sr-only">
                      Rejection reason
                    </label>
                    <input
                      id={`reject-reason-${request.id}`}
                      className="h-10 w-64 rounded-lg border border-[#d6dfe8] px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
                      placeholder="Reason for rejecting"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                    <Button
                      variant="outline"
                      disabled={actingId === request.id || !rejectReason.trim()}
                      onClick={() => confirmReject(request.id)}
                    >
                      Confirm rejection
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={actingId === request.id}
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setRejectingId(request.id)}>
                    Reject change
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}

      {message ? (
        <p role="status" className="rounded-xl border border-[#e7f4ec] bg-[#e7f4ec] p-4 text-xs text-[#1f7a4d]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-[#fdf0f2] bg-[#fdf0f2] p-4 text-xs text-[#a8384d]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// The success/error banner: rendered above the (possibly empty) request
// list so a decision on the last pending request still confirms itself.
function StatusBanner({ message, error }: { message: string; error: string }) {
  return (
    <>
      {message ? (
        <p role="status" className="rounded-xl border border-[#e7f4ec] bg-[#e7f4ec] p-4 text-xs text-[#1f7a4d]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-[#fdf0f2] bg-[#fdf0f2] p-4 text-xs text-[#a8384d]">
          {error}
        </p>
      ) : null}
    </>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
