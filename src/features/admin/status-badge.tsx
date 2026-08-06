import { CheckCircle2 } from "lucide-react";

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider ${
        active ? "bg-[#eaf6f4] text-[#23706b]" : "bg-[#f1f3f4] text-[#5f6368]"
      }`}
    >
      {active ? (
        <>
          <CheckCircle2 className="size-3" />
          Active
        </>
      ) : (
        "Deactivated"
      )}
    </span>
  );
}
