"use client";

import type { ChangeEvent, FormEvent, Ref } from "react";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import styles from "./expense-create.module.css";
import { Drawer } from "@/components/motion/drawer";
import { ReceiptPreview } from "@/features/receipts/receipt-preview";
import { receiptSizeLimitLabel, receiptValidationError } from "./receipt-file-validation";

type FormState = {
  title: string;
  category: string;
  subCategory: string;
  remark: string;
  amount: string;
  expenseDate: string;
};

const CATEGORY_SUB_CATEGORIES: Record<string, string[]> = {
  Travel: ["Airfare", "Fuel Expense", "Cab/Taxi", "Public Transport"],
  Meals: ["Team Lunch/Dinner", "Client Meeting", "Refreshments"],
  Software: ["Software License & Subscription", "SaaS Tools"],
  Hardware: ["Equipment Purchase", "Repairs & Maintenance"],
  Training: ["Course Fee", "Certification", "Conference"],
};

const MOBILE_QUERY = "(max-width: 820px)";

function subscribeToMobileQuery(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(MOBILE_QUERY);
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  query.addListener?.(onChange);
  return () => query.removeListener?.(onChange);
}

function getMobileSnapshot() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_QUERY).matches
    : false;
}

function useIsMobile() {
  // `null` is the server snapshot so hydration never commits a desktop viewer
  // before the client has resolved the actual breakpoint.
  return useSyncExternalStore(subscribeToMobileQuery, getMobileSnapshot, () => null);
}

type ReceiptSource =
  | { kind: "local"; file: File; fileName: string }
  | { kind: "stored"; claimId: string; fileName: string };

function resolveReceiptSource(
  receipt: File | null,
  storedReceiptName: string | undefined,
  claimId: string | null,
): ReceiptSource | null {
  if (receipt) return { kind: "local", file: receipt, fileName: receipt.name };
  if (storedReceiptName && claimId) {
    return { kind: "stored", claimId, fileName: storedReceiptName };
  }
  return null;
}

function receiptPreviewProps(source: ReceiptSource) {
  return source.kind === "local"
    ? { file: source.file, fileName: source.fileName }
    : { claimId: source.claimId, fileName: source.fileName };
}

// Pre-filled state when continuing an existing draft; receiptFileName is the
// name of the receipt already stored with the draft (it cannot be replaced).
export type ExpenseDraftInitial = {
  claimId: string;
  title: string;
  category: string;
  subCategory: string;
  remark: string;
  amount: string;
  expenseDate: string;
  receiptFileName?: string;
};

export function ExpenseCreateForm({
  initial = null,
  journey = [],
  canSubmit = true,
}: {
  initial?: ExpenseDraftInitial | null;
  /** The requester's published flow step names ("Team lead", role display names); drives the wizard's journey copy. */
  journey?: string[];
  canSubmit?: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const isMobile = useIsMobile();
  const [form, setForm] = useState<FormState>(() => ({
    title: initial?.title ?? "",
    category: initial?.category ?? "Travel",
    subCategory:
      initial?.subCategory ??
      CATEGORY_SUB_CATEGORIES[initial?.category ?? "Travel"]?.[0] ??
      CATEGORY_SUB_CATEGORIES.Travel[0],
    remark: initial?.remark ?? "",
    amount: initial?.amount ?? "",
    expenseDate: initial?.expenseDate ?? new Date().toISOString().slice(0, 10),
  }));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [claimId, setClaimId] = useState<string | null>(initial?.claimId ?? null);
  const [storedReceiptName, setStoredReceiptName] = useState<string | undefined>(initial?.receiptFileName);
  const [receiptSourceVersion, setReceiptSourceVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const viewReceiptButtonRef = useRef<HTMLButtonElement>(null);
  const receiptCloseButtonRef = useRef<HTMLButtonElement>(null);
  const sheetWasOpenRef = useRef(false);
  // Serializes the manual review save and the debounced autosave so two
  // requests never race for the same draft. The ref holds the in-flight
  // request so a caller can await it instead of guessing when the lock
  // releases (a skipped autosave would silently drop the newest edits).
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  // A queued save awaits the in-flight request, and the closure it captured
  // then holds stale form/claimId/receipt/submitted values. These refs are
  // the latest-value mirrors the request body is built from after the await.
  const formRef = useRef(form);
  const claimIdRef = useRef<string | null>(initial?.claimId ?? null);
  const receiptRef = useRef<File | null>(null);
  const submittedRef = useRef(false);
  const receiptSource = resolveReceiptSource(receipt, storedReceiptName, claimId);
  const receiptPreviewKey = receiptSource
    ? receiptSource.kind === "local"
      ? `file-${receiptSourceVersion}`
      : `claim-${receiptSource.claimId}`
    : null;

  useEffect(() => {
    if (sheetOpen) {
      sheetWasOpenRef.current = true;
      receiptCloseButtonRef.current?.focus();
    } else if (sheetWasOpenRef.current) {
      sheetWasOpenRef.current = false;
      viewReceiptButtonRef.current?.focus();
    }
  }, [receiptPreviewKey, sheetOpen]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      formRef.current = next;
      return next;
    });
    setDirty(true);
  }

  function chooseReceipt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const validationError = receiptValidationError(file);
    if (validationError) {
      // Clear the input so picking the same file again re-triggers change.
      event.target.value = "";
      setReceipt(null);
      receiptRef.current = null;
      setSheetOpen(false);
      setError(validationError);
      return;
    }
    setReceipt(file);
    receiptRef.current = file;
    setReceiptSourceVersion((version) => version + 1);
    setError(null);
    setDirty(true);
  }

  // The one request path for both the explicit "Review claim" save and the
  // debounced autosave. Returns true on success; on failure it surfaces the
  // error and leaves the form untouched so the user can retry. When a save
  // is already in flight it awaits that request first and then persists the
  // current form state - never silently skipping, or the newest edits would
  // be dropped on the floor.
  async function persistDraft(): Promise<boolean> {
    if (submittedRef.current) return false;
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }
    if (submittedRef.current) return false;
    // The closure may predate the awaited request (a queued save holds the
    // values from before the previous save landed, including a claim id the
    // previous save just created); the request is built from the latest
    // mirrors instead.
    const latestForm = formRef.current;
    const latestClaimId = claimIdRef.current;
    const latestReceipt = receiptRef.current;
    const request = (async () => {
      try {
        const body = new FormData();
        body.set("title", latestForm.title);
        body.set("category", latestForm.category);
        body.set("subCategory", latestForm.subCategory);
        body.set("remark", latestForm.remark);
        body.set("amount", latestForm.amount);
        body.set("expenseDate", latestForm.expenseDate);
        if (latestReceipt) body.set("receipt", latestReceipt);
        const response = await fetch(latestClaimId ? `/api/expenses/${latestClaimId}` : "/api/expenses", {
          method: latestClaimId ? "PATCH" : "POST",
          body,
        });
        // A non-JSON response (for example a platform-level error page) must
        // not escape as an unhandled exception; fall back to a generic message.
        let payload: { claim?: { id: string }; message?: string } = {};
        try {
          payload = (await response.json()) as { claim?: { id: string }; message?: string };
        } catch {
          payload = {};
        }
        if (!response.ok || !payload.claim) throw new Error(payload.message ?? "We could not save this draft.");
        // The draft now exists server-side; the id is authoritative for any
        // queued save waiting behind this one.
        claimIdRef.current = payload.claim.id;
        setClaimId(payload.claim.id);
        // A saved receipt is stored server-side; reflect that in live state and
        // clear the picked File so it can never be resubmitted or shown as
        // attached when it is not actually stored. A save without a freshly
        // picked file must never clear a previously stored receipt name.
        if (latestReceipt) {
          setStoredReceiptName(latestReceipt.name);
          setReceiptSourceVersion((version) => version + 1);
          receiptRef.current = null;
        }
        setReceipt(null);
        // Only a save whose inputs are still current may clear the dirty
        // flag: if the user edited the form (or picked a receipt) while this
        // request was in flight, those changes remain unsaved and the
        // autosave must fire again for them. A receipt consumed by this save
        // (cleared to null on success) counts as unchanged.
        const formUnchanged = formRef.current === latestForm;
        const receiptUnchanged = receiptRef.current === null || receiptRef.current === latestReceipt;
        if (formUnchanged && receiptUnchanged) setDirty(false);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "We could not save this draft.");
        return false;
      }
    })();
    saveInFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (saveInFlightRef.current === request) saveInFlightRef.current = null;
    }
  }

  // Autosave (UX research P0: drafts preserve across interrupted sessions):
  // once the draft is persistable, a quiet debounced save runs after the
  // user stops typing. The manual review save below shares the same persist
  // path, so the two can never race.
  const persistDraftEvent = useEffectEvent(persistDraft);
  useEffect(() => {
    if (submitted || !dirty) return;
    const persistable =
      form.title.trim() !== "" &&
      form.category.trim() !== "" &&
      form.amount.trim() !== "" &&
      Number(form.amount) > 0 &&
      form.expenseDate !== "";
    if (!persistable) return;
    const timer = window.setTimeout(() => {
      void persistDraftEvent();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [form, receipt, dirty, submitted, claimId]);

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const saved = await persistDraft();
    if (saved) setStep(3);
    setBusy(false);
  }

  async function submitClaim() {
    if (!claimId) return saveDraft();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/expenses/${claimId}/submit`, { method: "POST" });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "We could not submit this claim.");
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not submit this claim.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.topline}>
        <div>
          <p className={styles.eyebrow}>NEW REIMBURSEMENT</p>
          <p className={styles.smallText}>Your draft autosaves as you type. You can leave and come back anytime.</p>
        </div>
        <a className={styles.cancel} href="/expenses">Cancel</a>
      </div>

      {submitted ? <SubmittedState journey={journey} /> : (
        <div className={styles.content}>
          <p className={styles.eyebrow}>
            {step === 1 ? "STEP 1 OF 3 / RECEIPT" : step === 2 ? "STEP 2 OF 3 / DETAILS" : "STEP 3 OF 3 / REVIEW"}
          </p>
          <div className={step === 3 ? styles.splitLayout : styles.receiptLayout}>
            <div className={styles.wizardMain}>
              {step === 1 ? (
                <ReceiptStep
                  source={receiptSource}
                  chooseReceipt={chooseReceipt}
                  error={error}
                  onContinue={() => setStep(2)}
                  onRemove={() => {
                    setReceipt(null);
                    setSheetOpen(false);
                    setError(null);
                  }}
                />
              ) : step === 2 ? (
                <DetailsStep
                  form={form}
                  update={update}
                  onBack={() => setStep(1)}
                  onReview={saveDraft}
                  busy={busy}
                  error={error}
                />
              ) : receiptSource ? (
                <ReviewStep
                  form={form}
                  source={receiptSource}
                  journey={journey}
                  onBack={() => setStep(2)}
                  onSubmit={submitClaim}
                  busy={busy}
                  error={error}
                  canSubmit={canSubmit}
                />
              ) : null}
            </div>
            <aside className={`${styles.wizardSide} ${step === 3 ? styles.splitAside : ""}`}>
              {step === 1 ? <CaptureRail done={Boolean(receiptSource)} step={1} /> : null}
              {step === 2 ? <SummaryPanel form={form} label="Claim so far" journey={journey} /> : null}
              {step === 3 ? <ReviewIntro journey={journey} /> : null}
              {isMobile === true && receiptSource ? (
                <div className={styles.mobileReceiptAction}>
                  <button
                    ref={viewReceiptButtonRef}
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    type="button"
                    onClick={() => setSheetOpen(true)}
                  >
                    View receipt
                  </button>
                </div>
              ) : null}
              {/* The rail preview is desktop-only; mobile gets the sheet above. */}
              {isMobile === false && receiptSource ? (
                <div className={styles.captureRailPreview}>
                  <ReceiptPreviewSurface source={receiptSource} sourceKey={receiptPreviewKey} />
                </div>
              ) : null}
            </aside>
          </div>
          <Drawer
            open={sheetOpen && Boolean(receiptSource)}
            onOpenChange={setSheetOpen}
            ariaLabel="Receipt preview"
            className="w-full !max-w-full"
          >
            <div className="flex h-full min-h-0 flex-col p-3">
              {receiptSource ? (
                <ReceiptPreviewSurface
                  source={receiptSource}
                  sourceKey={receiptPreviewKey}
                  closeButtonRef={receiptCloseButtonRef}
                  onClose={() => setSheetOpen(false)}
                  className="min-h-0 flex-1"
                />
              ) : null}
            </div>
          </Drawer>
        </div>
      )}
    </div>
  );
}

function ReceiptStep({
  source,
  chooseReceipt,
  error,
  onContinue,
  onRemove,
}: {
  source: ReceiptSource | null;
  chooseReceipt: (event: ChangeEvent<HTMLInputElement>) => void;
  error: string | null;
  onContinue: () => void;
  onRemove: () => void;
}) {
  const attachedName = source?.fileName;
  const stored = source?.kind === "stored";
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className={styles.receiptStage}>
      <span className={styles.uploadIcon} aria-hidden>↑</span>
      <h1>{stored ? "Your proof is already in." : "Start with the proof."}</h1>
      <p>
        {stored
          ? "The receipt attached to this draft is stored and protected. It cannot be replaced here."
          : "Choose a PDF receipt. We'll ask for only the details we can't get from the document."}
      </p>
      {!stored ? (
        <div className={styles.uploadActions}>
          <label className={styles.button}>
            Add receipt
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept=".pdf,application/pdf"
              aria-describedby="receipt-format-hint"
              onChange={chooseReceipt}
            />
          </label>
          {source?.kind === "local" ? (
            <button
              className={`${styles.button} ${styles.buttonSecondary}`}
              type="button"
              onClick={() => {
                // Reset the input so picking the same file again fires a
                // change event after the removal.
                if (fileInputRef.current) fileInputRef.current.value = "";
                onRemove();
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className={styles.errorMessage}>{error}</p> : null}
      {!stored ? (
        <p id="receipt-format-hint" className={styles.smallText}>PDF files only, up to {receiptSizeLimitLabel()}.</p>
      ) : null}
      {attachedName ? (
        <div className={styles.receiptPreview}>
          <span>
            {stored ? `Receipt already attached: ${attachedName}` : `Receipt ready: ${attachedName}`}
          </span>
        </div>
      ) : null}
      {attachedName ? (
        <div style={{ marginTop: 28 }}>
          <button className={styles.button} type="button" onClick={onContinue}>
            Continue with receipt <span aria-hidden>→</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DetailsStep({
  form,
  update,
  onBack,
  onReview,
  busy,
  error,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onBack: () => void;
  onReview: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <section className={styles.panel} aria-label="Expense details">
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>DETAILS</p><h2>Just fill the gaps</h2></div>
        <span className={styles.statusChip}>Receipt attached</span>
      </div>
      <form className={styles.fieldStack} onSubmit={onReview}>
        <Field label="What was this expense for?"><input className={styles.textInput} required value={form.title} placeholder="e.g. Client dinner with Acme Corp" onChange={(event) => update("title", event.target.value)} /></Field>
        <div className={styles.formGrid}>
          <Field label="Category">
            <select
              className={styles.select}
              value={form.category}
              onChange={(event) => {
                const category = event.target.value;
                update("category", category);
                update("subCategory", CATEGORY_SUB_CATEGORIES[category]?.[0] ?? "");
              }}
            >
              {Object.keys(CATEGORY_SUB_CATEGORIES).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </Field>
          <Field label="Sub category">
            <select className={styles.select} value={form.subCategory} onChange={(event) => update("subCategory", event.target.value)}>
              {(CATEGORY_SUB_CATEGORIES[form.category] ?? []).map((subCategory) => (
                <option key={subCategory}>{subCategory}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className={styles.formGrid}>
          <Field label="Amount" hint="Enter the total in INR."><MoneyInput value={form.amount} onChange={(value) => update("amount", value)} /></Field>
          <Field label="Expense date"><input className={styles.textInput} required type="date" value={form.expenseDate} onChange={(event) => update("expenseDate", event.target.value)} /></Field>
        </div>
        <Field label="Remark" hint="A short note for Finance."><input className={styles.textInput} required value={form.remark} placeholder="e.g. IT travel expenses" onChange={(event) => update("remark", event.target.value)} /></Field>
      {error ? <p role="alert" className={styles.errorMessage}>{error}</p> : null}
        <div className={styles.actions}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={onBack}>Back</button><button className={styles.button} type="submit" disabled={busy}>{busy ? "Saving..." : "Review claim →"}</button></div>
      </form>
    </section>
  );
}

function ReviewStep({
  form,
  source,
  journey,
  onBack,
  onSubmit,
  busy,
  error,
  canSubmit,
}: {
  form: FormState;
  source: ReceiptSource;
  journey: string[];
  onBack: () => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
  canSubmit: boolean;
}) {
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = submitButtonRef.current;
    if (!button) return;
    if (button.getBoundingClientRect().top <= window.innerHeight) return;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    button.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, []);

  return (
    <section className={styles.panel} aria-label="Review expense claim">
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>FINAL CHECK</p><h2>Review before submission</h2></div><span className={styles.statusChip}>Draft</span></div>
      <SummaryPanel form={form} label="Submission summary" journey={journey} />
      <p className={styles.receiptPreview}>Attached: {source.fileName}</p>
      {error ? <p role="alert" className={styles.errorMessage}>{error}</p> : null}
      {!canSubmit ? <p role="status" className={styles.hint}>Your role does not have the submit privilege, so this draft cannot be sent for approval. Ask a Superadmin to enable it.</p> : null}
      <div className={styles.actions}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={onBack}>Edit details</button><button ref={submitButtonRef} className={styles.button} type="button" disabled={busy || !canSubmit} onClick={onSubmit}>{busy ? "Submitting..." : "Submit for approval →"}</button></div>
    </section>
  );
}

function journeyPhrase(journey: string[]): string {
  if (journey.length === 0) return "your organization's approval flow";
  if (journey.length === 1) return journey[0];
  return `${journey.slice(0, -1).join(", ")} and ${journey[journey.length - 1]}`;
}

function SubmittedState({ journey }: { journey: string[] }) {
  return <div className={styles.content}><div className={styles.panel}><p className={styles.eyebrow}>CLAIM SUBMITTED</p><h1 className={styles.title}>Your claim is moving.</h1><p className={styles.intro}>It is now with {journeyPhrase(journey)}. You can track every decision from the dashboard.</p><a className={styles.button} href="/expenses">Back to dashboard →</a></div></div>;
}

function ReviewIntro({ journey }: { journey: string[] }) {
  return <div><p className={styles.eyebrow}>READY FOR APPROVAL</p><h1>Check it once, then send it on.</h1><p className={styles.intro}>This claim will go through {journeyPhrase(journey)}.</p></div>;
}

function CaptureRail({ done, step }: { done: boolean; step: number }) {
  return <aside className={styles.captureRail}><p className={styles.eyebrow}>FAST CAPTURE</p><h2>Three things, then done.</h2><p>The form follows the natural order of expense work: proof, context, submit.</p><div className={styles.captureSteps}><CaptureStep number="1" title="Add proof" detail="PDF scan or upload" done={done} /><CaptureStep number="2" title="Confirm context" detail="Category and payment details" done={step > 1} /><CaptureStep number="3" title="Review & send" detail="See who reviews it next" done={step > 2} /></div></aside>;
}

function ReceiptPreviewSurface({
  source,
  sourceKey,
  closeButtonRef,
  onClose,
  className,
}: {
  source: ReceiptSource;
  sourceKey: string | null;
  closeButtonRef?: Ref<HTMLButtonElement>;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <ReceiptPreview
      key={sourceKey ?? undefined}
      {...receiptPreviewProps(source)}
      ref={closeButtonRef}
      onClose={onClose}
      className={className}
    />
  );
}

function SummaryPanel({ form, label, journey }: { form: FormState; label: string; journey: string[] }) {
  return <aside className={styles.summaryPanel} aria-label={label}><h2>{label}</h2><p className={styles.summaryAmount}>{form.amount ? `₹${form.amount}` : "₹0.00"}</p><div className={styles.summaryRows}><div className={styles.summaryRow}><span>Title</span><strong>{form.title || "Not added yet"}</strong></div><div className={styles.summaryRow}><span>Category</span><strong>{form.category} / {form.subCategory}</strong></div><div className={styles.summaryRow}><span>Date</span><strong>{form.expenseDate || "Not added yet"}</strong></div></div><div className={styles.summaryFooter}><p>Next: {journeyPhrase(journey)}</p></div></aside>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className={styles.field}><span className={styles.label}>{label}</span>{children}{hint ? <span className={styles.hint}>{hint}</span> : null}</label>;
}

function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className={styles.moneyInput}><span aria-hidden>₹</span><input className={styles.textInput} required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="0.00" value={value} onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))} /></div>;
}

function CaptureStep({ number, title, detail, done }: { number: string; title: string; detail: string; done: boolean }) {
  return <div className={`${styles.captureStep} ${done ? styles.captureStepDone : ""}`}><span className={styles.captureStepMarker}>{done ? "✓" : number}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}
