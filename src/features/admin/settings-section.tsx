"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "./section-heading";

// Company settings (ADR-0018): the absence auto-skip timeout drives how
// long a pending stage waits for its assigned actor before the claim
// advances on its own, enforced by the scheduled sweep worker and the lazy
// read path alike. Held claims are exempt from the sweep (ADR-0016), which
// is how the holds list surfaces them as stalled.
export function SettingsSection({
  absenceTimeoutDays: initialAbsenceTimeoutDays,
  onMessage,
  onError,
}: {
  absenceTimeoutDays: number;
  onMessage: (message: string) => void;
  onError: (error: string) => void;
}) {
  const [absenceTimeoutDays, setAbsenceTimeoutDays] = useState(initialAbsenceTimeoutDays);
  const [saving, setSaving] = useState(false);

  const saveAbsenceTimeout = async () => {
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/admin/org-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ absenceTimeoutDays }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as { absenceTimeoutDays: number };
      setAbsenceTimeoutDays(body.absenceTimeoutDays);
      onMessage(
        `Absence auto-skip timeout set to ${body.absenceTimeoutDays} day${
          body.absenceTimeoutDays === 1 ? "" : "s"
        }.`,
      );
    } catch {
      onError("The absence timeout could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="settings" className="mt-11" aria-labelledby="settings-title">
      <SectionHeading
        number="4"
        icon={Settings}
        title="Company settings"
        description="Superadmin tunes company-wide approval behavior."
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
          <h3 className="text-sm font-semibold text-[#1c2f46]">Absence auto-skip timeout</h3>
          <p className="mt-1 text-xs text-[#7d8a9b]">
            A pending approval stage advances to the next one when its assigned actor has not
            decided within this many days. The scheduled sweep enforces it even when nobody opens
            the app.
          </p>
          <label className="mt-3 block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="absence-timeout-days">
            Days
          </label>
          <input
            id="absence-timeout-days"
            type="number"
            min={1}
            max={90}
            className="mt-2 h-10 w-full rounded-lg border border-[#d6dfe8] px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
            value={absenceTimeoutDays}
            onChange={(event) => setAbsenceTimeoutDays(Number(event.target.value))}
          />
          <Button
            className="mt-4"
            disabled={saving || !Number.isInteger(absenceTimeoutDays) || absenceTimeoutDays < 1 || absenceTimeoutDays > 90}
            onClick={saveAbsenceTimeout}
          >
            Save timeout
          </Button>
        </div>
      </div>
    </section>
  );
}
