"use client";

import type { LucideIcon } from "lucide-react";

export function SectionHeading({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e8f2f6] text-xs font-bold text-[#196d86]">{number}</span>
      <div>
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-[#196d86]" />
          <h2 className="font-semibold text-[#1c2f46]">{title}</h2>
        </div>
        <p className="mt-1 text-sm text-[#7d8a9b]">{description}</p>
      </div>
    </div>
  );
}
