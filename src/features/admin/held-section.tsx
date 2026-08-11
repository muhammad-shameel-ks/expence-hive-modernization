"use client";

import { ArrowUpRight, PauseCircle } from "lucide-react";
import type { HeldClaimRow } from "@/server/expenses/ports";
import { SectionHeading } from "./section-heading";

// The held-claims oversight view (ADR-0016): Superadmin sees every held
// claim in the organization - claim, holder, reason, held-at, and stage -
// with quick navigation into the expense drawer. Holds are indefinite, so
// this list is where stalled claims surface; delegation (slice 05) will let
// the console re-point a held claim to a new actor, who then resumes it.

function formatHeldAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function HeldSection({ heldClaims }: { heldClaims: HeldClaimRow[] }) {
  return (
    <section id="holds" className="mt-11" aria-labelledby="holds-title">
      <SectionHeading
        number="5"
        icon={PauseCircle}
        title="Held claims"
        description="Claims paused by their current stage actor. The holder resumes them from the expense drawer; nothing else can act on them until then."
      />
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e1e7ee] bg-white">
        {heldClaims.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[#7d8a9b]">
            No claims are on hold right now.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="bg-[#f6f9fb] text-left text-xs font-semibold uppercase tracking-wide text-[#7d8a9b]">
                  <th className="px-5 py-3 font-semibold">Claim</th>
                  <th className="px-5 py-3 font-semibold">Holder</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Held on</th>
                  <th className="px-5 py-3 font-semibold">Stage</th>
                  <th className="px-5 py-3 font-semibold text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {heldClaims.map((claim) => (
                  <tr
                    key={claim.claimId}
                    className="border-t border-[#edf1f5] text-[#26364b] hover:bg-[#f8fafc]"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[#1c2f46]">{claim.title}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-[#7d8a9b]">{claim.ref}</p>
                    </td>
                    <td className="px-5 py-3.5 text-[#526278]">{claim.heldBy}</td>
                    <td className="max-w-[280px] px-5 py-3.5">
                      <p className="line-clamp-2 whitespace-normal text-[#526278]">
                        {claim.heldReason || "No reason recorded"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-[#526278]">
                      {formatHeldAt(claim.heldAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3e9fa] px-2.5 py-1 text-xs font-semibold text-[#7a3ba8]">
                        <PauseCircle className="size-3" aria-hidden />
                        {claim.stage}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        href={`/expenses?claim=${encodeURIComponent(claim.claimId)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#d6dfe8] px-3 py-1.5 text-xs font-semibold text-[#196d86] transition-colors hover:bg-[#e8f2f6]"
                      >
                        View claim
                        <ArrowUpRight className="size-3" aria-hidden />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
