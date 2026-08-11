"use client";
// The dashboard's period switch (ADR-0020): month / year / overall, default
// month. The choice is persisted in a cookie (path-scoped, non-HttpOnly) so
// the server component recomputes cards, the claims list, and the activity
// feed together on every switch and the choice survives across visits.

import { useRouter } from "next/navigation";
import { DASHBOARD_PERIOD_COOKIE, type DashboardPeriod } from "@/server/expenses/dashboard-read-models";

export { DASHBOARD_PERIOD_COOKIE };

export const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "overall", label: "Overall" },
];

/** The name=value cookie pair, kept pure for tests. */
export function dashboardPeriodCookieValue(period: DashboardPeriod): string {
  return `${DASHBOARD_PERIOD_COOKIE}=${period}`;
}

export function PeriodSwitch({ period }: { period: DashboardPeriod }) {
  const router = useRouter();

  return (
    <div
      role="group"
      aria-label="Dashboard period"
      className="inline-flex items-center rounded-xl border border-border bg-card p-0.5 shadow-sm"
    >
      {PERIOD_OPTIONS.map((option) => {
        const active = option.value === period;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (active) return;
              // A year-long non-HttpOnly cookie so the server read path
              // (src/app/expenses/page.tsx) picks the period up on the next
              // request; router.refresh re-renders the route server-side.
              document.cookie = `${dashboardPeriodCookieValue(option.value)}; path=/; max-age=31536000; samesite=lax`;
              router.refresh();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
