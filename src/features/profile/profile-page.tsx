"use client";

import { useState } from "react";
import { CreditCard, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BankDetailChangeRequest, BankDetails } from "@/server/expenses/ports";
import type { Profile } from "@/server/expenses/profile";

// The profiles page (ADR-0024): identity shown read-only, personal fields
// editable, and bank details managed through change requests that enter a
// pending state until an authorized role approves them. Mutations run
// server-side through the profile API; the client only re-reads the
// authoritative read model after each write.

const EMPTY_FORM: BankDetails = {
  holderName: "",
  accountNumber: "",
  ifsc: "",
  bankName: "",
  branch: "",
};

const inputClass =
  "mt-2 h-10 w-full rounded-lg border border-[#d6dfe8] px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5] disabled:cursor-not-allowed disabled:opacity-60";
const labelClass =
  "mt-3 block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]";

const STATUS_LABELS: Record<BankDetailChangeRequest["status"], { label: string; className: string }> = {
  pending: { label: "Pending approval", className: "bg-[#fdf4e3] text-[#8a6d1a]" },
  approved: { label: "Approved", className: "bg-[#e7f4ec] text-[#1f7a4d]" },
  rejected: { label: "Rejected", className: "bg-[#fdf0f2] text-[#a8384d]" },
};

export function ProfilePage({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [phone, setPhone] = useState(initialProfile.employee.phone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [bankForm, setBankForm] = useState<BankDetails>(EMPTY_FORM);
  const [savingBankDetails, setSavingBankDetails] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pendingRequest = profile.requests.find((request) => request.status === "pending");

  const refresh = async (): Promise<Profile> => {
    const response = await fetch("/api/profile", { cache: "no-store" });
    if (!response.ok) throw new Error("profile-read");
    const body = (await response.json()) as { profile: Profile };
    return body.profile;
  };

  const savePhone = async () => {
    setSavingPhone(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/profile/personal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "unknown");
      }
      setProfile(await refresh());
      setMessage("Phone number saved.");
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "profile-read"
          ? caught.message
          : "The phone number could not be saved. Please try again.",
      );
    } finally {
      setSavingPhone(false);
    }
  };

  const submitBankDetails = async () => {
    setSavingBankDetails(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/profile/bank-details", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bankForm),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "unknown");
      }
      const updated = await refresh();
      setProfile(updated);
      setBankForm(EMPTY_FORM);
      setMessage(
        "Bank details submitted for approval. They take effect once a role with the approve bank detail changes privilege approves them.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "profile-read"
          ? caught.message
          : "The bank details could not be submitted. Please try again.",
      );
    } finally {
      setSavingBankDetails(false);
    }
  };

  const setField = (key: keyof BankDetails, value: string) => {
    setBankForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section
        className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]"
        aria-labelledby="profile-identity-title"
      >
        <div className="flex items-start gap-2">
          <UserRound className="mt-0.5 size-4 shrink-0 text-[#196d86]" />
          <div>
            <h2 id="profile-identity-title" className="text-sm font-semibold text-[#1c2f46]">
              Identity
            </h2>
            <p className="mt-1 text-xs text-[#7d8a9b]">
              Read-only: role, department, and manager are assigned by your administrator.
            </p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-xs text-[#526278]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-bold uppercase tracking-[0.08em] text-[#8a96a8]">Name</dt>
            <dd className="text-right font-semibold text-[#33445c]">{profile.employee.name}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-bold uppercase tracking-[0.08em] text-[#8a96a8]">Email</dt>
            <dd className="text-right font-semibold text-[#33445c]">
              {profile.employee.email ?? "Not provided"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-bold uppercase tracking-[0.08em] text-[#8a96a8]">Role</dt>
            <dd className="text-right font-semibold text-[#33445c]">
              {profile.employee.role?.displayName ?? "Unassigned"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-bold uppercase tracking-[0.08em] text-[#8a96a8]">Department</dt>
            <dd className="text-right font-semibold text-[#33445c]">
              {profile.department ?? "Unassigned"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-bold uppercase tracking-[0.08em] text-[#8a96a8]">Manager</dt>
            <dd className="text-right font-semibold text-[#33445c]">
              {profile.manager?.name ?? "None"}
            </dd>
          </div>
        </dl>

        <h3 className="mt-6 text-sm font-semibold text-[#1c2f46]">Contact details</h3>
        <label className={labelClass} htmlFor="profile-phone">
          Phone
        </label>
        <input
          id="profile-phone"
          className={inputClass}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+91 98765 43210"
          autoComplete="tel"
        />
        <Button className="mt-4" disabled={savingPhone} onClick={savePhone}>
          Save phone
        </Button>
      </section>

      <section
        className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]"
        aria-labelledby="profile-bank-title"
      >
        <div className="flex items-start gap-2">
          <CreditCard className="mt-0.5 size-4 shrink-0 text-[#196d86]" />
          <div>
            <h2 id="profile-bank-title" className="text-sm font-semibold text-[#1c2f46]">
              Bank details
            </h2>
            <p className="mt-1 text-xs text-[#7d8a9b]">
              Reimbursements are paid to the currently approved account. A change enters a pending
              state and takes effect only after an authorized role approves it.
            </p>
          </div>
        </div>

        {profile.approvedBankDetails ? (
          <div className="mt-4 rounded-xl border border-[#eef2f6] bg-[#fafbfc] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#1f7a4d]">
              Currently approved account
            </p>
            <dl className="mt-2 grid gap-1.5 text-xs text-[#526278]">
              <div className="flex justify-between gap-3">
                <dt className="text-[#8a96a8]">Holder</dt>
                <dd className="font-semibold text-[#33445c]">
                  {profile.approvedBankDetails.holderName}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#8a96a8]">Account number</dt>
                <dd className="font-semibold text-[#33445c]">
                  {profile.approvedBankDetails.accountNumber}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#8a96a8]">IFSC</dt>
                <dd className="font-semibold text-[#33445c]">{profile.approvedBankDetails.ifsc}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#8a96a8]">Bank</dt>
                <dd className="font-semibold text-[#33445c]">
                  {profile.approvedBankDetails.bankName}, {profile.approvedBankDetails.branch}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-[#fdf0f2] bg-[#fdf0f2] p-4 text-xs text-[#a8384d]">
            No approved account yet. You cannot submit expenses until an approved bank detail
            record exists.
          </p>
        )}

        {pendingRequest ? (
          <p
            role="note"
            className="mt-4 rounded-xl border border-[#fdf4e3] bg-[#fdf4e3] p-4 text-xs text-[#8a6d1a]"
          >
            A bank-details change is pending approval. The current account stays active until an
            authorized role approves or rejects it.
          </p>
        ) : (
          <>
            <h3 className="mt-5 text-sm font-semibold text-[#1c2f46]">Request a change</h3>
            <label className={labelClass} htmlFor="bank-holder-name">
              Account holder name
            </label>
            <input
              id="bank-holder-name"
              className={inputClass}
              value={bankForm.holderName}
              onChange={(event) => setField("holderName", event.target.value)}
              autoComplete="cc-name"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="bank-account-number">
                  Account number
                </label>
                <input
                  id="bank-account-number"
                  className={inputClass}
                  value={bankForm.accountNumber}
                  onChange={(event) => setField("accountNumber", event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="bank-ifsc">
                  IFSC
                </label>
                <input
                  id="bank-ifsc"
                  className={inputClass}
                  value={bankForm.ifsc}
                  onChange={(event) => setField("ifsc", event.target.value)}
                  placeholder="HDFC0001234"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="bank-name">
                  Bank name
                </label>
                <input
                  id="bank-name"
                  className={inputClass}
                  value={bankForm.bankName}
                  onChange={(event) => setField("bankName", event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="bank-branch">
                  Branch
                </label>
                <input
                  id="bank-branch"
                  className={inputClass}
                  value={bankForm.branch}
                  onChange={(event) => setField("branch", event.target.value)}
                />
              </div>
            </div>
            <Button className="mt-4" disabled={savingBankDetails} onClick={submitBankDetails}>
              Submit for approval
            </Button>
          </>
        )}
      </section>

      <section
        className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)] lg:col-span-2"
        aria-labelledby="profile-history-title"
      >
        <h2 id="profile-history-title" className="text-sm font-semibold text-[#1c2f46]">
          Bank-details change history
        </h2>
        {profile.requests.length === 0 ? (
          <p className="mt-3 text-xs text-[#7d8a9b]">No bank-details changes yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-xs text-[#526278]">
            {profile.requests.map((request) => (
              <li key={request.id} className="rounded-xl border border-[#eef2f6] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${STATUS_LABELS[request.status].className}`}
                  >
                    {STATUS_LABELS[request.status].label}
                  </span>
                  <span className="text-[#8a96a8]">
                    Submitted {formatDate(request.requestedAt)}
                  </span>
                  {request.reviewedAt ? (
                    <span className="text-[#8a96a8]">
                      Reviewed {formatDate(request.reviewedAt)}
                    </span>
                  ) : null}
                </div>
                <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a96a8]">Account</dt>
                    <dd className="font-semibold text-[#33445c]">
                      {request.requested.holderName}, {request.requested.accountNumber}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#8a96a8]">IFSC</dt>
                    <dd className="font-semibold text-[#33445c]">{request.requested.ifsc}</dd>
                  </div>
                  <div className="flex justify-between gap-3 sm:col-span-2">
                    <dt className="text-[#8a96a8]">Bank</dt>
                    <dd className="font-semibold text-[#33445c]">
                      {request.requested.bankName}, {request.requested.branch}
                    </dd>
                  </div>
                </dl>
                {request.rejectionReason ? (
                  <p className="mt-2 rounded-lg border border-[#fdf0f2] bg-[#fdf0f2] p-2 text-[#a8384d]">
                    Rejection reason: {request.rejectionReason}
                  </p>
                ) : null}
                {request.history.some((event) => event.kind !== "submitted") ? (
                  <p className="mt-2 text-[#8a96a8]">
                    {request.history
                      .filter((event) => event.kind !== "submitted")
                      .map((event) =>
                        event.kind === "approved"
                          ? `Approved by ${event.actorName ?? "an authorized role"}`
                          : `Rejected by ${event.actorName ?? "an authorized role"}`,
                      )
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {message ? (
        <p
          role="status"
          className="rounded-xl border border-[#e7f4ec] bg-[#e7f4ec] p-4 text-xs text-[#1f7a4d] lg:col-span-2"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[#fdf0f2] bg-[#fdf0f2] p-4 text-xs text-[#a8384d] lg:col-span-2"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
