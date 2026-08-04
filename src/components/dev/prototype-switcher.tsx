"use client";
// PROTOTYPE-ONLY. Not for production. Floating bottom bar to flip between
// dashboard "below the stat cards" layout variants via ?variant=.
// Delete this file (and its usages) once a variant is chosen and folded in.

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  paramName = "variant",
}: {
  variants: { key: string; label: string }[];
  paramName?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramName) ?? variants[0].key;
  const index = Math.max(0, variants.findIndex((v) => v.key === current));

  const go = (nextIndex: number) => {
    const wrapped = (nextIndex + variants.length) % variants.length;
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, variants[wrapped].key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping) return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div className="flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-white shadow-xl">
        <button
          type="button"
          onClick={() => go(index - 1)}
          className="rounded-full p-1.5 hover:bg-zinc-700"
          aria-label="Previous variant"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[10rem] text-center text-sm font-medium">
          {variants[index].key} — {variants[index].label}
        </span>
        <button
          type="button"
          onClick={() => go(index + 1)}
          className="rounded-full p-1.5 hover:bg-zinc-700"
          aria-label="Next variant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
