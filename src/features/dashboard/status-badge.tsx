"use client";

import { AnimatedBadge } from "@/components/motion/animated-badge";
import { cn } from "@/lib/utils";
import { HELD_META, statusBadgeClass } from "./journey-meta";
import { STATUS_META, type Expense, type ExpenseStatus } from "./mock-data";

// The Held-aware status badge (ADR-0016): a held claim keeps its flow
// status but renders the Held badge on every surface, so the swap between
// Held and the underlying status lives in exactly one component.
export function StatusBadge({
  held,
  status,
  className,
}: {
  held: Expense["held"];
  status: ExpenseStatus;
  className?: string;
}) {
  if (held) {
    return (
      <AnimatedBadge status={HELD_META.tone} size="sm" contentKey="Held">
        {HELD_META.label}
      </AnimatedBadge>
    );
  }
  const meta = STATUS_META[status];
  return (
    <AnimatedBadge status={meta.tone} size="sm" className={cn(statusBadgeClass(status), className)}>
      {meta.label}
    </AnimatedBadge>
  );
}
