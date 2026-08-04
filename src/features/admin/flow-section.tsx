"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Plus,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminRole, FlowDraft } from "@/server/admin/ports";
import { SectionHeading } from "./section-heading";

const FLOW_ROLES: AdminRole[] = [
  "Manager",
  "IT reviewer",
  "Finance reviewer",
  "CEO delegate",
];

type FlowStep = {
  id: number;
  role: AdminRole;
};

export function FlowSection({
  flows,
  onMessage,
  onError,
}: {
  flows: FlowDraft[];
  onMessage: (message: string) => void;
  onError: (error: string) => void;
}) {
  const [flowName, setFlowName] = useState("Standard reimbursement");
  const [flowScope, setFlowScope] = useState("All departments");
  const [newRole, setNewRole] = useState<AdminRole>("Manager");
  const [steps, setSteps] = useState<FlowStep[]>(
    flows[0]?.steps.map((role, index) => ({ id: index, role })) ?? [
      { id: 1, role: "Manager" },
      { id: 2, role: "Finance reviewer" },
      { id: 3, role: "CEO delegate" },
    ],
  );
  const [saving, setSaving] = useState(false);
  const nextStepId = useRef(
    Math.max(0, ...steps.map((step) => step.id)) + 1,
  );

  const saveFlowDraft = async () => {
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/admin/flows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: flowName,
          scope: flowScope,
          steps: steps.map((step) => step.role),
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      onMessage(`${flowName || "Flow"} saved as a draft for ${flowScope}.`);
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only HR and system administrators can create flows."
          : "The flow could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    const id = nextStepId.current;
    nextStepId.current += 1;
    setSteps((current) => [...current, { id, role: newRole }]);
    onMessage(`${newRole} added to the flow.`);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  return (
    <section id="flow" className="mt-12" aria-labelledby="flow-title">
      <SectionHeading number="2" icon={Workflow} title="Create an approval flow" description="A flow is an ordered list of roles. It does not assign individual people." />
      <div className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)] sm:p-6">
          <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="flow-name">Flow name</label>
          <input id="flow-name" className="mt-2 h-10 w-full rounded-lg border border-[#d6dfe8] px-3 text-sm font-semibold text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]" value={flowName} onChange={(event) => setFlowName(event.target.value)} />
          <label className="mt-5 block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="flow-scope">Use this flow for</label>
          <select id="flow-scope" className="mt-2 h-10 w-full rounded-lg border border-[#d6dfe8] bg-white px-3 text-sm text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]" value={flowScope} onChange={(event) => setFlowScope(event.target.value)}>
            <option>All departments</option>
            <option>Engineering</option>
            <option>Operations</option>
            <option>Finance</option>
            <option>IT</option>
            <option>Executive</option>
          </select>
          <div className="mt-6 rounded-xl border border-[#dce8ed] bg-[#f2f7fa] p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#196d86]" />
              <p className="text-xs leading-5 text-[#526278]">
                People become eligible for a step because they have that role. If nobody has the role, HR will see the missing assignment before publishing.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-[#1c2f46]">{flowName || "Untitled flow"}</h3>
              <p className="mt-1 text-xs text-[#8a96a8]">{flowScope} · {steps.length} approval steps</p>
            </div>
            <span className="rounded-full border border-[#d6dfe8] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[#8a96a8]">Draft</span>
          </div>
          <div className="mt-6 space-y-2">
            {steps.map((step, index) => (
              <FlowStepRow
                key={step.id}
                step={step}
                index={index}
                total={steps.length}
                onMove={moveStep}
                onRemove={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef2f6] pt-4">
            <label className="sr-only" htmlFor="role-to-add">Role to add</label>
            <select id="role-to-add" className="h-9 min-w-[170px] flex-1 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]" value={newRole} onChange={(event) => setNewRole(event.target.value as AdminRole)}>
              {FLOW_ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
            <Button variant="outline" onClick={addStep}>
              <Plus /> Add role
            </Button>
          </div>
          <Button
            className="mt-5 w-full bg-[#196d86] hover:bg-[#175d75]"
            disabled={saving}
            onClick={saveFlowDraft}
          >
            {saving ? "Saving..." : "Save flow draft"}
            <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  );
}

function FlowStepRow({ step, index, total, onMove, onRemove }: { step: FlowStep; index: number; total: number; onMove: (index: number, direction: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#eef2f6] bg-[#fbfcfd] px-3 py-2.5">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e8f2f6] text-xs font-bold text-[#196d86]">{index + 1}</span>
      <span className="flex-1 text-sm font-semibold text-[#526278]">{step.role}</span>
      <div className="flex items-center gap-1">
        <button aria-label={`Move ${step.role} up`} className="rounded-md p-1.5 text-[#9aa6b5] hover:bg-white hover:text-[#526278] disabled:opacity-30" disabled={index === 0} onClick={() => onMove(index, -1)}>
          <ArrowUp className="size-3.5" />
        </button>
        <button aria-label={`Move ${step.role} down`} className="rounded-md p-1.5 text-[#9aa6b5] hover:bg-white hover:text-[#526278] disabled:opacity-30" disabled={index === total - 1} onClick={() => onMove(index, 1)}>
          <ArrowDown className="size-3.5" />
        </button>
        <button aria-label={`Remove ${step.role}`} className="rounded-md p-1.5 text-[#b2becb] hover:bg-[#fdf0f2] hover:text-[#b85f70]" onClick={onRemove}>
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
