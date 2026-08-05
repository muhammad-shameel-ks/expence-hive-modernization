"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import styles from "./expense-create.module.css";

type FormState = {
  title: string;
  category: string;
  subCategory: string;
  remark: string;
  amount: string;
  expenseDate: string;
  accountNumber: string;
  ifscCode: string;
};

const CATEGORY_SUB_CATEGORIES: Record<string, string[]> = {
  Travel: ["Airfare", "Fuel Expense", "Cab/Taxi", "Public Transport"],
  Meals: ["Team Lunch/Dinner", "Client Meeting", "Refreshments"],
  Software: ["Software License & Subscription", "SaaS Tools"],
  Hardware: ["Equipment Purchase", "Repairs & Maintenance"],
  Training: ["Course Fee", "Certification", "Conference"],
};

const initialForm: FormState = {
  title: "",
  category: "Travel",
  subCategory: CATEGORY_SUB_CATEGORIES.Travel[0],
  remark: "",
  amount: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  accountNumber: "",
  ifscCode: "",
};

export function ExpenseCreateForm() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState(initialForm);
  const [receipt, setReceipt] = useState<{ fileName: string; contentType: string } | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseReceipt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setReceipt({ fileName: file.name, contentType: file.type || "application/octet-stream" });
  }

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, attachment: receipt }),
      });
      const payload = (await response.json()) as { claim?: { id: string }; message?: string };
      if (!response.ok || !payload.claim) throw new Error(payload.message ?? "We could not save this draft.");
      setClaimId(payload.claim.id);
      setStep(3);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not save this draft.");
    } finally {
      setBusy(false);
    }
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
          <p className={styles.smallText}>Your draft is saved to ExpenseHive as you continue.</p>
        </div>
        <a className={styles.cancel} href="/expenses">Cancel</a>
      </div>

      {submitted ? <SubmittedState /> : null}
      {!submitted && step === 1 ? <ReceiptStep receipt={receipt} chooseReceipt={chooseReceipt} onSkip={() => setStep(2)} onContinue={() => setStep(2)} /> : null}
      {!submitted && step === 2 ? <DetailsStep form={form} receipt={receipt} update={update} onBack={() => setStep(1)} onReview={saveDraft} busy={busy} error={error} /> : null}
      {!submitted && step === 3 ? <ReviewStep form={form} receipt={receipt} onBack={() => setStep(2)} onSubmit={submitClaim} busy={busy} error={error} /> : null}
    </div>
  );
}

function ReceiptStep({
  receipt,
  chooseReceipt,
  onSkip,
  onContinue,
}: {
  receipt: { fileName: string; contentType: string } | null;
  chooseReceipt: (event: ChangeEvent<HTMLInputElement>) => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  return (
    <div className={styles.content}>
      <p className={styles.eyebrow}>STEP 1 OF 3 / RECEIPT</p>
      <div className={styles.receiptLayout}>
        <section className={styles.receiptStage}>
          <span className={styles.uploadIcon} aria-hidden>↑</span>
          <h1>Start with the proof.</h1>
          <p>Take a photo or choose a receipt. We&apos;ll ask for only the details we can&apos;t get from the document.</p>
          <div className={styles.uploadActions}>
            <label className={styles.button}>
              Add receipt
              <input className={styles.fileInput} type="file" accept="image/*,.pdf" onChange={chooseReceipt} />
            </label>
            <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={onSkip}>Skip for now</button>
          </div>
          {receipt ? <div className={styles.receiptPreview}>Receipt ready: {receipt.fileName}</div> : null}
          {receipt ? <div style={{ marginTop: 28 }}><button className={styles.button} type="button" onClick={onContinue}>Continue with receipt <span aria-hidden>→</span></button></div> : null}
        </section>
        <CaptureRail receipt={receipt} step={1} />
      </div>
    </div>
  );
}

function DetailsStep({
  form,
  receipt,
  update,
  onBack,
  onReview,
  busy,
  error,
}: {
  form: FormState;
  receipt: { fileName: string; contentType: string } | null;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onBack: () => void;
  onReview: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className={styles.content}>
      <p className={styles.eyebrow}>STEP 2 OF 3 / DETAILS</p>
      <div className={styles.receiptLayout}>
        <section className={styles.panel} aria-label="Expense details">
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>DETAILS</p><h2>Just fill the gaps</h2></div>
            <span className={styles.statusChip}>{receipt ? "Receipt attached" : "Receipt skipped"}</span>
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
            <Field label="Remark" hint="A short note for Finance and HR."><input className={styles.textInput} required value={form.remark} placeholder="e.g. IT travel expenses" onChange={(event) => update("remark", event.target.value)} /></Field>
            <div className={styles.formGrid}>
              <Field label="Account number" hint="Only Finance and HR can see this."><input className={styles.textInput} required value={form.accountNumber} placeholder="Bank account number" onChange={(event) => update("accountNumber", event.target.value)} /></Field>
              <Field label="IFSC code" hint="Only Finance and HR can see this."><input className={styles.textInput} required value={form.ifscCode} placeholder="e.g. SBIN0012861" onChange={(event) => update("ifscCode", event.target.value.toUpperCase())} /></Field>
            </div>
            {error ? <p role="alert" className={styles.errorMessage}>{error}</p> : null}
            <div className={styles.actions}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={onBack}>Back</button><button className={styles.button} type="submit" disabled={busy}>{busy ? "Saving..." : "Review claim →"}</button></div>
          </form>
        </section>
        <SummaryPanel form={form} label="Claim so far" />
      </div>
    </div>
  );
}

function ReviewStep({ form, receipt, onBack, onSubmit, busy, error }: { form: FormState; receipt: { fileName: string; contentType: string } | null; onBack: () => void; onSubmit: () => void; busy: boolean; error: string | null }) {
  return (
    <div className={styles.content}>
      <p className={styles.eyebrow}>STEP 3 OF 3 / REVIEW</p>
      <div className={styles.splitLayout}>
        <aside className={styles.splitAside}><p className={styles.eyebrow}>READY FOR APPROVAL</p><h1>Check it once, then send it on.</h1><p className={styles.intro}>This claim will follow the standard path: Manager → IT → CEO → Finance.</p></aside>
        <section className={styles.panel} aria-label="Review expense claim">
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>FINAL CHECK</p><h2>Review before submission</h2></div><span className={styles.statusChip}>Draft</span></div>
          <SummaryPanel form={form} label="Submission summary" />
          {receipt ? <p className={styles.receiptPreview}>Attached: {receipt.fileName}</p> : <p className={styles.hint}>No receipt attached. You can continue with the exception path.</p>}
          {error ? <p role="alert" className={styles.errorMessage}>{error}</p> : null}
          <div className={styles.actions}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={onBack}>Edit details</button><button className={styles.button} type="button" disabled={busy} onClick={onSubmit}>{busy ? "Submitting..." : "Submit for approval →"}</button></div>
        </section>
      </div>
    </div>
  );
}

function SubmittedState() {
  return <div className={styles.content}><div className={styles.panel}><p className={styles.eyebrow}>CLAIM SUBMITTED</p><h1 className={styles.title}>Your claim is moving.</h1><p className={styles.intro}>It is now with your Manager, followed by IT, CEO, and Finance. You can track every decision from the dashboard.</p><a className={styles.button} href="/expenses">Back to dashboard →</a></div></div>;
}

function CaptureRail({ receipt, step }: { receipt: { fileName: string; contentType: string } | null; step: number }) {
  return <aside className={styles.captureRail}><p className={styles.eyebrow}>FAST CAPTURE</p><h2>Three things, then done.</h2><p>The form follows the natural order of expense work: proof, context, submit.</p><div className={styles.captureSteps}><CaptureStep number="1" title="Add proof" detail="Photo, scan, or PDF" done={Boolean(receipt)} /><CaptureStep number="2" title="Confirm context" detail="Category and payment details" done={step > 1} /><CaptureStep number="3" title="Review & send" detail="See who reviews it next" done={step > 2} /></div></aside>;
}

function SummaryPanel({ form, label }: { form: FormState; label: string }) {
  return <aside className={styles.summaryPanel} aria-label={label}><h2>{label}</h2><p className={styles.summaryAmount}>{form.amount ? `₹${form.amount}` : "₹0.00"}</p><div className={styles.summaryRows}><div className={styles.summaryRow}><span>Title</span><strong>{form.title || "Not added yet"}</strong></div><div className={styles.summaryRow}><span>Category</span><strong>{form.category} / {form.subCategory}</strong></div><div className={styles.summaryRow}><span>Date</span><strong>{form.expenseDate || "Not added yet"}</strong></div></div><div className={styles.summaryFooter}><p>Next: Manager → IT → CEO → Finance</p></div></aside>;
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
