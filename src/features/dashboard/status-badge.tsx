"use client";

import { AnimatedBadge } from "@/components/motion/animated-badge";
import { cn } from "@/lib/utils";
import { statusBadgeClass } from "./journey-meta";
import { STATUS_META, type ExpenseStatus } from "./mock-data";

export function StatusBadge({
  status,
  className,
}: {
  status: ExpenseStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <AnimatedBadge status={meta.tone} size="sm" className={cn(statusBadgeClass(status), className)}>
      {meta.label}
    </AnimatedBadge>
  );
}
