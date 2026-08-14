"use client";

import { useId, useState } from "react";
import type { ReceiptSuggestion } from "@/server/receipts/ports";
import styles from "./expense-create.module.css";

// The OCR suggestions panel (ADR-0025): after a PDF receipt is picked, the
// wizard shows the extracted values as editable fields the employee confirms
// or edits. Nothing is written to the draft until "Apply suggestions" is
// pressed; "Skip suggestions" dismisses the panel and the flow stays fully
// usable without OCR. The category field is explicitly labeled as a guess,
// because category drives policy behavior.

export type ReceiptSuggestionsStatus =
  | "loading"
  | "ready"
  | "failed"
  | "applied"
  | "dismissed";

export type AppliedSuggestions = {
  amount: string;
  date: string;
  vendor: string;
  category: string;
};

export function ReceiptSuggestionsPanel({
  status,
  suggestions,
  message,
  categories,
  onApply,
  onDismiss,
}: {
  status: ReceiptSuggestionsStatus;
  suggestions: ReceiptSuggestion;
  message?: string;
  categories: readonly string[];
  onApply: (values: AppliedSuggestions) => void;
  onDismiss: () => void;
}) {
  const amountInputId = useId();
  const dateInputId = useId();
  const vendorInputId = useId();
  const categoryInputId = useId();
  const [amount, setAmount] = useState(
    suggestions.amountMinor !== undefined ? (suggestions.amountMinor / 100).toFixed(2) : "",
  );
  const [date, setDate] = useState(suggestions.date ?? "");
  const [vendor, setVendor] = useState(suggestions.vendor ?? "");
  const [category, setCategory] = useState(suggestions.categoryGuess ?? categories[0] ?? "");

  // A new suggestion set replaces the editable values. The sync happens
  // during render (the React pattern for derived state), so the values are
  // committed with the same render that shows the ready panel - never in a
  // later effect, which would let the employee read stale empty fields.
  const [previousSuggestions, setPreviousSuggestions] = useState(suggestions);
  if (previousSuggestions !== suggestions) {
    setPreviousSuggestions(suggestions);
    setAmount(suggestions.amountMinor !== undefined ? (suggestions.amountMinor / 100).toFixed(2) : "");
    setDate(suggestions.date ?? "");
    setVendor(suggestions.vendor ?? "");
    setCategory(suggestions.categoryGuess ?? categories[0] ?? "");
  }

  if (status === "dismissed") return null;

  return (
    <section className={styles.suggestionsPanel} aria-label="Receipt suggestions">
      {status === "loading" ? (
        <p role="status" className={styles.hint}>
          Reading your receipt…
        </p>
      ) : null}

      {status === "failed" ? (
        <div>
          <p role="alert" className={styles.errorMessage}>
            {message ?? "We could not read any details from this receipt. You can add them yourself."}
          </p>
          <button
            className={`${styles.button} ${styles.buttonSecondary}`}
            type="button"
            onClick={onDismiss}
          >
            No suggestions
          </button>
        </div>
      ) : null}

      {status === "ready" ? (
        <div>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>FROM THE RECEIPT</p>
              <h2>We read your receipt</h2>
            </div>
          </div>
          <p className={styles.hint}>
            Check these suggestions, edit what is wrong, then apply. Nothing is saved to the draft
            until you apply.
          </p>
          <div className={styles.fieldStack}>
            <label className={styles.field} htmlFor={amountInputId}>
              <span className={styles.label}>Amount</span>
              <MoneyInput id={amountInputId} value={amount} onChange={setAmount} />
            </label>
            <label className={styles.field} htmlFor={dateInputId}>
              <span className={styles.label}>Expense date</span>
              <input
                id={dateInputId}
                className={styles.textInput}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className={styles.field} htmlFor={vendorInputId}>
              <span className={styles.label}>Vendor</span>
              <input
                id={vendorInputId}
                className={styles.textInput}
                type="text"
                value={vendor}
                onChange={(event) => setVendor(event.target.value)}
              />
              <span className={styles.hint}>Applied to the expense title.</span>
            </label>
            <label className={styles.field} htmlFor={categoryInputId}>
              <span className={styles.label}>Suggested category - please confirm</span>
              <select
                id={categoryInputId}
                className={styles.select}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <span className={styles.hint}>
                This is a guess from the receipt text, not a policy decision. Choose the category
                that fits.
              </span>
            </label>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.button}
              type="button"
              onClick={() =>
                onApply({ amount, date, vendor, category })
              }
            >
              Apply suggestions
            </button>
            <button
              className={`${styles.button} ${styles.buttonSecondary}`}
              type="button"
              onClick={onDismiss}
            >
              Skip suggestions
            </button>
          </div>
        </div>
      ) : null}

      {status === "applied" ? (
        <p role="status" className={styles.hint}>
          Applied to your draft. You can still edit these fields in the next step.
        </p>
      ) : null}
    </section>
  );
}

function MoneyInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.moneyInput}>
      <span aria-hidden>₹</span>
      <input
        id={id}
        className={styles.textInput}
        type="text"
        inputMode="decimal"
        pattern="[0-9]+(\.[0-9]{1,2})?"
        placeholder="0.00"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
      />
    </div>
  );
}
