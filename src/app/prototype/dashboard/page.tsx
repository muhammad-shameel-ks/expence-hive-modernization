// PROTOTYPE — three variants of the ExpenseHive dashboard, switchable with
// ?variant=A|B|C on /prototype/dashboard. Throwaway route: do not ship.
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import VariantA from "./variant-a";
import VariantB from "./variant-b";
import VariantC from "./variant-c";
import { PrototypeSwitcher, VARIANT_KEYS } from "./prototype-switcher";

export default function DashboardPrototypePage() {
  return (
    <Suspense fallback={<p>Loading prototype…</p>}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const searchParams = useSearchParams();
  const raw = (searchParams.get("variant") ?? "A").toUpperCase();
  const current = VARIANT_KEYS.includes(raw as (typeof VARIANT_KEYS)[number])
    ? raw
    : "A";

  return (
    <>
      {current === "A" && <VariantA />}
      {current === "B" && <VariantB />}
      {current === "C" && <VariantC />}
      {process.env.NODE_ENV !== "production" && (
        <PrototypeSwitcher current={current} />
      )}
    </>
  );
}
