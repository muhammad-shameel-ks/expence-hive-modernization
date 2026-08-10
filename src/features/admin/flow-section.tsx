"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  GripVertical,
  Play,
  Plus,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminDepartment, AdminRole, FlowDraft, FlowStatus } from "@/server/admin/ports";
import type { AmountGuard } from "@/server/shared/amount-guard";
import { SectionHeading } from "./section-heading";
import {
  GUARD_OPERATOR_LABELS,
  GUARD_OPERATORS,
  minorToRupees,
  rupeesToMinor,
  simulateRoute,
  validateStepGuard,
} from "./flow-guard";

type FlowStep = {
  id: number;
  kind: "role" | "team-lead";
  roleId: string | null;
  guard: AmountGuard | null;
  guardAmountInput?: string;
};

const TEAM_LEAD_LABEL = "Team lead";

function stepFromInput(
  input: ({ kind: "role"; roleId: string } | { kind: "team-lead" }) & { guard?: AmountGuard | null },
  id: number,
): FlowStep {
  const guard = input.guard ?? null;
  return input.kind === "role"
    ? {
        id,
        kind: "role",
        roleId: input.roleId,
        guard,
        guardAmountInput: guard ? minorToRupees(guard.amountMinor) : "",
      }
    : {
        id,
        kind: "team-lead",
        roleId: null,
        guard,
        guardAmountInput: guard ? minorToRupees(guard.amountMinor) : "",
      };
}

function stepToInput(step: FlowStep): { kind: "role"; roleId: string; guard: AmountGuard | null } | { kind: "team-lead"; guard: AmountGuard | null } {
  return step.kind === "role"
    ? { kind: "role", roleId: step.roleId ?? "", guard: step.guard }
    : { kind: "team-lead", guard: step.guard };
}

export function FlowSection({
  flows,
  roles,
  departments,
  onMessage,
  onError,
}: {
  flows: FlowDraft[];
  roles: AdminRole[];
  departments?: AdminDepartment[];
  onMessage: (message: string) => void;
  onError: (error: string) => void;
}) {
  const [flowsState, setFlowsState] = useState(flows);
  const activeRoles = roles.filter((role) => role.active);
  const firstRoleId = activeRoles[0]?.id ?? "";

  const [simulatingStep, setSimulatingStep] = useState<number | null>(null);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationAmount, setSimulationAmount] = useState("10000");
  const [simulatedRoute, setSimulatedRoute] = useState<ReturnType<typeof simulateRoute> | null>(null);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [editingFlowId, setEditingFlowId] = useState<string | null>(flows[0]?.id ?? null);
  const [editingFlowStatus, setEditingFlowStatus] = useState<FlowStatus | null>(flows[0]?.status ?? null);
  const [flowName, setFlowName] = useState(flows[0]?.name ?? "Standard reimbursement");
  const [targetRoleId, setTargetRoleId] = useState(flows[0]?.roleId ?? firstRoleId);
  const [steps, setSteps] = useState<FlowStep[]>(
    flows[0]?.steps.map((step, index) => stepFromInput(step, index)) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewingFlowId, setViewingFlowId] = useState<string | null>(null);
  const nextStepId = useRef(Math.max(0, ...steps.map((step) => step.id)) + 1);

  const stepValidations = steps.map((step, index) =>
    validateStepGuard(step, index, steps.length),
  );
  const hasGuardErrors = stepValidations.some((v) => !v.isValid);

  const roleName = (roleId: string) => {
    const role = activeRoles.find((r) => r.id === roleId);
    if (!role) return roleId;
    if (role.departmentId && departments) {
      const dept = departments.find((d) => d.id === role.departmentId);
      if (dept) {
        return `${role.displayName} (${dept.name})`;
      }
    }
    return role.displayName;
  };

  const deleteFlow = async (flow: FlowDraft) => {
    if (typeof window !== "undefined" && !window.confirm(`Are you sure you want to delete the flow "${flow.name}"?`)) {
      return;
    }
    setDeleting(flow.id);
    onError("");
    try {
      const response = await fetch("/api/admin/flows/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId: flow.id }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      setFlowsState((current) => current.filter((item) => item.id !== flow.id));
      if (viewingFlowId === flow.id) {
        setViewingFlowId(null);
      }
      if (editingFlowId === flow.id) {
        resetEditor();
      }
      onMessage(`${flow.name} deleted.`);
    } catch {
      onError("The flow could not be deleted. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  const loadFlowIntoEditor = (flow: FlowDraft) => {
    setEditingFlowId(flow.id);
    setEditingFlowStatus(flow.status);
    setFlowName(flow.name);
    setTargetRoleId(flow.roleId);
    setSteps(flow.steps.map((step, index) => stepFromInput(step, index)));
    nextStepId.current = flow.steps.length;
    onMessage(`Loaded flow "${flow.name}" into editor.`);
    if (typeof window !== "undefined") {
      const element = document.getElementById("flow");
      element?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const resetEditor = () => {
    setEditingFlowId(null);
    setEditingFlowStatus(null);
    setFlowName("New reimbursement flow");
    setTargetRoleId(firstRoleId);
    setSteps([]);
    nextStepId.current = 0;
    onMessage("Editor reset for creating a new flow.");
  };

  const saveFlow = async (publishImmediately = false) => {
    if (hasGuardErrors) {
      onError("Please resolve guard validation errors before saving.");
      return;
    }
    setSaving(true);
    onError("");
    try {
      let saved: FlowDraft;
      if (editingFlowId) {
        const response = await fetch("/api/admin/flows/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
            body: JSON.stringify({
              flowId: editingFlowId,
              name: flowName,
              roleId: targetRoleId,
              steps: steps.map((step) => stepToInput(step)),
            }),
        });
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "unknown");
        }
        const body = (await response.json()) as { flow: FlowDraft };
        saved = body.flow;
        setFlowsState((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        setEditingFlowStatus(saved.status);
      } else {
        const response = await fetch("/api/admin/flows", {
          method: "POST",
          headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: flowName,
              roleId: targetRoleId,
              steps: steps.map((step) => stepToInput(step)),
            }),
        });
        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "unknown");
        }
        const body = (await response.json()) as { flow: FlowDraft };
        saved = body.flow;
        setFlowsState((current) => [saved, ...current]);
        setEditingFlowId(saved.id);
        setEditingFlowStatus(saved.status);
      }

      if (publishImmediately && saved.status === "draft") {
        await publishFlow(saved);
      } else {
        onMessage(`Flow "${flowName}" saved successfully.`);
      }
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can configure flows."
          : "The flow could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const publishFlow = async (flow: FlowDraft) => {
    setPublishing(flow.id);
    onError("");
    try {
      const response = await fetch("/api/admin/flows/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId: flow.id }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as { flow: FlowDraft };
      setFlowsState((current) =>
        current.map((item) => {
          if (item.id === body.flow.id) return body.flow;
          return item;
        }),
      );
      onMessage(`${flow.name} published.`);
    } catch {
      onError("The flow could not be published. Please try again.");
    } finally {
      setPublishing(null);
    }
  };

  const addStep = (roleIdToAdd: string) => {
    const id = nextStepId.current;
    nextStepId.current += 1;
    setSteps((current) => [...current, { id, kind: "role", roleId: roleIdToAdd, guard: null }]);
    onMessage(`${roleName(roleIdToAdd)} added to the flow.`);
  };

  const addTeamLeadStep = () => {
    const id = nextStepId.current;
    nextStepId.current += 1;
    setSteps((current) => [...current, { id, kind: "team-lead", roleId: null, guard: null }]);
    onMessage(`${TEAM_LEAD_LABEL} added to the flow.`);
  };

  const insertStepAt = (position: number, roleIdToAdd: string) => {
    const id = nextStepId.current;
    nextStepId.current += 1;
    setSteps((current) => {
      const next = [...current];
      next.splice(position, 0, { id, kind: "role", roleId: roleIdToAdd, guard: null });
      return next;
    });
    onMessage(`${roleName(roleIdToAdd)} inserted at position ${position + 1}.`);
  };

  const stepLabel = (step: FlowStep) => {
    if (step.kind === "team-lead") return TEAM_LEAD_LABEL;
    return roleName(step.roleId ?? "");
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

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    setSteps((current) => {
      const next = [...current];
      const [movedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      return next;
    });
    const moved = steps[draggedIndex];
    onMessage(`Moved ${moved ? stepLabel(moved) : "step"} to step ${targetIndex + 1}.`);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const runSimulation = () => {
    const totalMinor = rupeesToMinor(simulationAmount);
    if (totalMinor === null) {
      onError("Enter a valid amount in rupees to simulate the path.");
      return;
    }
    onError("");
    const route = simulateRoute(steps, totalMinor);
    setSimulatedRoute(route);
    setSimulatingStep(0);
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      if (current > steps.length) {
        clearInterval(interval);
        setSimulatingStep(null);
      } else {
        setSimulatingStep(current);
      }
    }, 800);
  };

  return (
    <section id="flow" className="mt-8" aria-labelledby="flow-title">
      <SectionHeading
        number="2"
        icon={Workflow}
        title="Create & manage approval flows"
        description="Design ordered role pipelines. Every employee holding the assigned role will follow this approval path."
      />

      <div className="mt-5 rounded-2xl border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)] sm:p-6">
          {/* Editor Header Banner */}
          {editingFlowId ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#b7d8e5] bg-[#f0f7fa] px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1c2f46]">
                <Edit3 className="size-4 text-[#196d86]" />
                <span>Editing Existing Flow:</span>
                <span className="text-[#196d86] font-extrabold">{flowName}</span>
                {editingFlowStatus ? (
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${
                    editingFlowStatus === "published"
                      ? "bg-[#e6f4ea] text-[#137333]"
                      : "bg-[#feefc3] text-[#b06000]"
                  }`}>
                    {editingFlowStatus}
                  </span>
                ) : null}
              </div>
              <button
                onClick={resetEditor}
                className="flex items-center gap-1 rounded-lg border border-[#cbd5e1] bg-white px-2.5 py-1 text-xs font-bold text-[#475569] shadow-2xs hover:bg-[#f1f5f9] hover:text-[#1c2f46]"
              >
                + Create New Flow
              </button>
            </div>
          ) : null}

          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eef2f6] pb-5">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="canvas-flow-name">
                  Flow Name
                </label>
                <input
                  id="canvas-flow-name"
                  className="mt-1 block h-9 rounded-lg border border-[#d6dfe8] px-3 text-xs font-semibold text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
                  value={flowName}
                  onChange={(e) => setFlowName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="canvas-target-role">
                  Target Role
                </label>
                <select
                  id="canvas-target-role"
                  className="mt-1 block h-9 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]"
                  value={targetRoleId}
                  onChange={(e) => setTargetRoleId(e.target.value)}
                >
                  {activeRoles.map((role) => (
                    <option key={role.id} value={role.id}>{role.displayName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-lg border border-[#d6dfe8] bg-[#f8fafc] px-3 py-1.5 text-[0.68rem] font-semibold text-[#64748b] lg:flex">
                <GripVertical className="size-3.5 text-[#196d86]" /> Drag & drop nodes to re-order
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-expanded={simulationOpen}
                aria-controls="simulation-panel"
                onClick={() => setSimulationOpen((open) => !open)}
              >
                <Play className="size-3.5 text-[#196d86]" />
                Simulate path
                <ChevronDown className={`size-3.5 transition-transform ${simulationOpen ? "rotate-180" : ""}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saving || !targetRoleId || steps.length === 0 || hasGuardErrors}
                onClick={() => saveFlow(false)}
              >
                {saving ? "Saving..." : editingFlowId ? "Save Changes" : "Save Draft"}
              </Button>
              <Button
                className="bg-[#196d86] hover:bg-[#175d75]"
                size="sm"
                disabled={saving || !targetRoleId || steps.length === 0 || hasGuardErrors}
                onClick={() => saveFlow(true)}
              >
                {editingFlowStatus === "published" ? "Save & Update Flow" : "Save & Publish Flow"}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Interactive Drag & Drop Node Canvas Container */}
          {simulationOpen && (
            <div id="simulation-panel" className="mt-5 rounded-2xl border border-[#d6dfe8] bg-[#f8fafc] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[#1c2f46]">Simulate a claim&apos;s path</p>
                  <p className="mt-0.5 text-[0.68rem] text-[#64748b]">
                    Enter a test amount to preview which steps run and which are auto-skipped. Nothing is saved.                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="canvas-simulation-amount">
                    Test amount
                  </label>
                  <input
                    id="canvas-simulation-amount"
                    inputMode="decimal"
                    className="h-9 w-24 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]"
                    value={simulationAmount}
                    onChange={(e) => setSimulationAmount(e.target.value)}
                  />
                  <Button variant="outline" size="sm" onClick={runSimulation}>
                    <Play className="size-3.5 text-[#196d86]" />
                    Simulate
                  </Button>
                </div>
              </div>
              {simulatedRoute && (
                <p className="mt-3 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-[0.68rem] font-semibold text-[#475569]">
                  {simulatedRoute.filter((step) => step.runs).length} of {simulatedRoute.length} steps run for ₹{minorToRupees(rupeesToMinor(simulationAmount)) || simulationAmount}; auto-skipped steps are highlighted amber.
                </p>
              )}
            </div>
          )}

          {/* Interactive Drag & Drop Node Canvas Container */}
          <div className="mt-5 min-h-[380px] overflow-x-auto rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] p-6 shadow-inner">
            <div className="flex min-w-[700px] items-center gap-3 py-4">
              
              {/* Start Trigger Node */}
              <div className="flex shrink-0 flex-col items-center">
                <div className="flex min-w-[170px] items-center gap-3 rounded-2xl border border-[#b7d8e5] bg-white p-4 shadow-md transition-transform hover:scale-[1.02]">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f2f6] text-[#196d86]">
                    <Zap className="size-5" />
                  </div>
                  <div>
                    <span className="rounded-md bg-[#e6f4ea] px-1.5 py-0.5 text-[0.6rem] font-bold text-[#137333]">
                      Start Trigger
                    </span>
                    <strong className="mt-1 block text-xs text-[#1c2f46]">
                      Request Submitted
                    </strong>
                    <span className="block text-[0.65rem] text-[#7d8a9b]">
                      By {roleName(targetRoleId)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Arrow Connector to First Stage */}
              <div className="flex items-center text-[#94a3b8]">
                <ArrowRight className="size-5" />
              </div>

              {/* Drag and Drop Approval Node Pipeline */}
              {steps.map((step, index) => {
                const isSimulating = simulatingStep === index + 1;
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;
                const isTerminal = index === steps.length - 1;
                const route = simulatedRoute?.[index];
                const isSkipped = simulatedRoute !== null && route !== undefined && !route.runs;
                const validation = stepValidations[index] ?? { isValid: true };

                return (
                  <div
                    key={step.id}
                    className="flex shrink-0 items-center gap-3"
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(index));
                      setDraggedIndex(index);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnter={() => setDragOverIndex(index)}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(index);
                    }}
                    onDragEnd={() => {
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                  >
                    {/* Draggable Node Card */}
                    <div className={`relative min-w-[230px] rounded-2xl border p-4 shadow-md transition-all cursor-grab active:cursor-grabbing ${
                      isDragging
                        ? "opacity-40 border-dashed border-[#196d86] bg-[#e8f2f6] scale-95 shadow-none"
                        : isDragOver
                          ? "border-[#196d86] ring-4 ring-[#b7d8e5] scale-105 bg-[#e8f2f6]"
                          : isSkipped
                            ? "border-[#d6a01f] bg-[#fdf8ec] ring-4 ring-[#f5e2b8]"
                            : isSimulating
                              ? "border-[#196d86] bg-[#e8f2f6] ring-4 ring-[#b7d8e5] scale-105"
                              : !validation.isValid
                                ? "border-[#a8384d] bg-white ring-2 ring-[#f5d0d6]"
                                : "border-[#cbd5e1] bg-white hover:border-[#196d86]"
                    }`}>
                      <div className="flex items-center justify-between gap-2 border-b border-[#f1f5f9] pb-2">
                        <span className="flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-[#196d86]">
                          <GripVertical className="size-3.5 text-[#94a3b8]" /> Step {index + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            aria-label="Move left"
                            disabled={index === 0}
                            onClick={() => moveStep(index, -1)}
                            className="rounded-md p-1 text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#334155] disabled:opacity-30"
                          >
                            <ArrowUp className="size-3 -rotate-90" />
                          </button>
                          <button
                            aria-label="Move right"
                            disabled={index === steps.length - 1}
                            onClick={() => moveStep(index, 1)}
                            className="rounded-md p-1 text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#334155] disabled:opacity-30"
                          >
                            <ArrowDown className="size-3 -rotate-90" />
                          </button>
                          <button
                            aria-label="Remove node"
                            onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
                            className="rounded-md p-1 text-[#cbd5e1] hover:bg-[#fdf0f2] hover:text-[#a8384d]"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2.5">
                        {step.kind === "team-lead" ? (
                          <div className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-[#cbd5e1] bg-[#f8fafc] px-2 text-xs font-semibold text-[#1e293b]">
                            <span>{TEAM_LEAD_LABEL}</span>
                            <span className="rounded-full bg-[#e8f2f6] px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-[#196d86]">
                              Named person
                            </span>
                          </div>
                        ) : (
                          <>
                            <label className="sr-only" htmlFor={`node-role-${step.id}`}>Role for step {index + 1}</label>
                            <select
                              id={`node-role-${step.id}`}
                              className="h-8 w-full rounded-lg border border-[#cbd5e1] bg-[#f8fafc] px-2 text-xs font-semibold text-[#1e293b] outline-none focus:border-[#196d86]"
                              value={step.roleId ?? ""}
                              onChange={(e) => {
                                const newRole = e.target.value;
                                setSteps((current) => current.map((item) => item.id === step.id ? { ...item, kind: "role", roleId: newRole } : item));
                              }}
                            >
                              {activeRoles.map((role) => (
                                <option key={role.id} value={role.id}>{role.displayName}</option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>

                      {isTerminal ? (
                        step.guard !== null ? (
                          <div
                            id={`node-terminal-error-${step.id}`}
                            role="alert"
                            className="mt-2.5 rounded-lg border border-[#f5c6cb] bg-[#f8d7da] p-2 text-[0.65rem]"
                          >
                            <p className="font-semibold text-[#721c24]">
                              Terminal step cannot carry an amount condition.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setSteps((current) =>
                                  current.map((item) =>
                                    item.id === step.id ? { ...item, guard: null, guardAmountInput: "" } : item,
                                  ),
                                );
                              }}
                              className="mt-1 font-bold text-[#a8384d] underline hover:text-[#721c24]"
                            >
                              Remove condition
                            </button>
                          </div>
                        ) : (
                          <p className="mt-2.5 text-[0.62rem] font-semibold text-[#64748b]">
                            Terminal stage - cannot carry an amount condition.
                          </p>
                        )
                      ) : (
                        <fieldset
                          className={`mt-2.5 rounded-lg border p-2 ${
                            validation.operatorError || validation.amountError
                              ? "border-[#a8384d] bg-[#fdf0f2]"
                              : "border-[#e2e8f0] bg-[#f8fafc]"
                          }`}
                        >
                          <legend className="px-1 text-[0.55rem] font-bold uppercase tracking-wider text-[#64748b]">
                            Amount condition
                          </legend>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <label className="sr-only" htmlFor={`node-guard-op-${step.id}`}>Amount condition operator for step {index + 1}</label>
                              <select
                                id={`node-guard-op-${step.id}`}
                                aria-invalid={Boolean(validation.operatorError)}
                                aria-describedby={validation.operatorError ? `node-guard-op-error-${step.id}` : undefined}
                                className={`h-7 w-[7.5rem] rounded-md border bg-white px-1.5 text-[0.65rem] font-semibold text-[#334155] outline-none focus:border-[#196d86] ${
                                  validation.operatorError ? "border-[#a8384d] focus:ring-1 focus:ring-[#a8384d]" : "border-[#cbd5e1]"
                                }`}
                                value={step.guard?.operator ?? ""}
                                onChange={(e) => {
                                  const operator = e.target.value as (typeof GUARD_OPERATORS)[number] | "";
                                  setSteps((current) =>
                                    current.map((item) => {
                                      if (item.id !== step.id) return item;
                                      if (operator === "") {
                                        return { ...item, guard: null, guardAmountInput: "" };
                                      }
                                      const currentInput =
                                        item.guardAmountInput !== undefined
                                          ? item.guardAmountInput
                                          : item.guard?.amountMinor
                                            ? minorToRupees(item.guard.amountMinor)
                                            : "";
                                      const minor = rupeesToMinor(currentInput);
                                      return {
                                        ...item,
                                        guardAmountInput: currentInput,
                                        guard: {
                                          operator,
                                          amountMinor: minor !== null && minor > 0 ? minor : 0,
                                        },
                                      };
                                    }),
                                  );
                                }}
                              >
                                <option value="">No condition</option>
                                {GUARD_OPERATORS.map((operator) => (
                                  <option key={operator} value={operator}>{GUARD_OPERATOR_LABELS[operator]}</option>
                                ))}
                              </select>
                              {step.guard && (
                                <>
                                  <label className="sr-only" htmlFor={`node-guard-amount-${step.id}`}>Amount for condition on step {index + 1}</label>
                                  <div className="relative flex items-center">
                                    <span className="pointer-events-none absolute left-2 text-[0.65rem] font-bold text-[#64748b]">₹</span>
                                    <input
                                      id={`node-guard-amount-${step.id}`}
                                      inputMode="decimal"
                                      aria-invalid={Boolean(validation.amountError)}
                                      aria-describedby={validation.amountError ? `node-guard-amount-error-${step.id}` : undefined}
                                      value={
                                        step.guardAmountInput !== undefined
                                          ? step.guardAmountInput
                                          : step.guard.amountMinor > 0
                                            ? minorToRupees(step.guard.amountMinor)
                                            : ""
                                      }
                                      onChange={(e) => {
                                        const newAmountInput = e.target.value;
                                        const amountMinor = rupeesToMinor(newAmountInput);
                                        setSteps((current) =>
                                          current.map((item) =>
                                            item.id === step.id && item.guard
                                              ? {
                                                  ...item,
                                                  guardAmountInput: newAmountInput,
                                                  guard: {
                                                    operator: item.guard.operator,
                                                    amountMinor: amountMinor !== null && amountMinor > 0 ? amountMinor : 0,
                                                  },
                                                }
                                              : item,
                                          ),
                                        );
                                      }}
                                      className={`h-7 w-20 rounded-md border bg-white pl-5 pr-1.5 text-[0.65rem] font-semibold text-[#334155] outline-none focus:border-[#196d86] ${
                                        validation.amountError ? "border-[#a8384d] focus:ring-1 focus:ring-[#a8384d]" : "border-[#cbd5e1]"
                                      }`}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                            {validation.operatorError && (
                              <p
                                id={`node-guard-op-error-${step.id}`}
                                role="alert"
                                className="text-[0.62rem] font-semibold text-[#a8384d]"
                              >
                                {validation.operatorError}
                              </p>
                            )}
                            {validation.amountError && (
                              <p
                                id={`node-guard-amount-error-${step.id}`}
                                role="alert"
                                className="text-[0.62rem] font-semibold text-[#a8384d]"
                              >
                                {validation.amountError}
                              </p>
                            )}
                          </div>
                        </fieldset>
                      )}

                      <div className="mt-3 flex items-center justify-between gap-2 text-[0.62rem] text-[#64748b]">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3 text-[#94a3b8]" /> 3-day timeout
                        </span>
                        <span className="font-semibold text-[#166534]">Auto-skips</span>
                      </div>
                      {isSkipped && route?.reason && (
                        <p className="mt-2 rounded-md bg-[#fdf3d7] px-2 py-1 text-[0.62rem] font-semibold text-[#8a6414]">
                          Auto-skips: {route.reason}
                        </p>
                      )}
                    </div>

                    {/* Inline Insert "+" Button & Arrow Connector */}
                    <div className="flex items-center gap-1.5">
                      <button
                        title="Insert role stage here"
                        onClick={() => insertStepAt(index + 1, activeRoles[0]?.id ?? "")}
                        className="grid size-6 place-items-center rounded-full border border-[#cbd5e1] bg-white text-[#64748b] shadow-xs hover:border-[#196d86] hover:bg-[#196d86] hover:text-white transition-all"
                      >
                        <Plus className="size-3.5" />
                      </button>
                      <ArrowRight className="size-5 text-[#94a3b8]" />
                    </div>
                  </div>
                );
              })}

              {/* End Completion Node */}
              <div className="flex shrink-0 flex-col items-center">
                <div className="flex min-w-[180px] items-center gap-3 rounded-2xl border border-[#cbd5e1] bg-white p-4 shadow-md">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6f4ea] text-[#137333]">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <div>
                    <span className="rounded-md bg-[#f1f5f9] px-1.5 py-0.5 text-[0.6rem] font-bold text-[#475569]">
                      Terminal
                    </span>
                    <strong className="mt-1 block text-xs text-[#1c2f46]">
                      Finance & Payment
                    </strong>
                    <span className="block text-[0.65rem] text-[#7d8a9b]">
                      Verified & Paid
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Quick Add Role Palette at Bottom of Canvas */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e8f0] pt-4 text-xs">
              <span className="font-semibold text-[#475569]">Quick Add Stage Node:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={addTeamLeadStep}
                  className="flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-2.5 py-1 font-semibold text-[#334155] shadow-2xs hover:border-[#196d86] hover:bg-[#e8f2f6] hover:text-[#175d75] transition-all"
                >
                  <Plus className="size-3" />
                  {TEAM_LEAD_LABEL}
                  <span className="rounded-full bg-[#e8f2f6] px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-[#196d86]">
                    Named person
                  </span>
                </button>
                {activeRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => addStep(role.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-2.5 py-1 font-semibold text-[#334155] shadow-2xs hover:border-[#196d86] hover:bg-[#e8f2f6] hover:text-[#175d75] transition-all"
                  >
                    <Plus className="size-3" />
                    {role.displayName}
                    {role.locked ? (
                      <span className="rounded-full bg-[#f1f3f4] px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-[#5f6368]">
                        Locked
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

      {/* Existing Flows List */}
      {flowsState.length > 0 ? (
        <div className="mt-6 rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
          <h3 className="text-sm font-semibold text-[#1c2f46]">Existing flows</h3>
          <ul className="mt-3 space-y-3">
            {flowsState.map((flow) => {
              const isViewing = viewingFlowId === flow.id;
              return (
                <li key={flow.id} className="rounded-xl border border-[#eef2f6] bg-[#fbfcfd] p-3 text-xs transition-colors hover:border-[#d6dfe8]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#1c2f46]">{flow.name}</span>
                      <span className="text-[#8a96a8]">·</span>
                      <span className="text-[#526278]">Role: {roleName(flow.roleId)}</span>
                      <span className="text-[#8a96a8]">·</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${
                          flow.status === "published"
                            ? "bg-[#e6f4ea] text-[#137333]"
                            : flow.status === "draft"
                              ? "bg-[#feefc3] text-[#b06000]"
                              : "bg-[#f1f3f4] text-[#5f6368]"
                        }`}
                      >
                        {flow.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingFlowId(isViewing ? null : flow.id)}
                      >
                        {isViewing ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        {isViewing ? "Hide steps" : "View steps"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadFlowIntoEditor(flow)}
                      >
                        <Edit3 className="size-3.5" />
                        Load in editor
                      </Button>
                      {flow.status === "draft" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={publishing === flow.id}
                          onClick={() => publishFlow(flow)}
                        >
                          {publishing === flow.id ? "Publishing..." : "Publish"}
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="hover:border-[#e8c4cb] hover:bg-[#fdf0f2] hover:text-[#a8384d]"
                        disabled={deleting === flow.id}
                        onClick={() => deleteFlow(flow)}
                      >
                        <Trash2 className="size-3.5" />
                        {deleting === flow.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                  {isViewing ? (
                    <div className="mt-3 border-t border-[#eef2f6] pt-3">
                      <div className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-[#8a96a8]">
                        Approval Sequence ({flow.steps.length} steps)
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {flow.steps.length > 0 ? (
                          flow.steps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="flex items-center gap-1.5 rounded-lg border border-[#d6dfe8] bg-white px-3 py-1.5 font-medium text-[#33445c] shadow-2xs">
                                <span className="grid size-5 place-items-center rounded-full bg-[#e8f2f6] text-[0.65rem] font-bold text-[#196d86]">
                                  {idx + 1}
                                </span>
                                {step.kind === "role" ? roleName(step.roleId) : TEAM_LEAD_LABEL}
                              </span>
                              {idx < flow.steps.length - 1 ? (
                                <ArrowRight className="size-3.5 text-[#9aa6b5]" />
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <span className="italic text-[#8a96a8]">No steps defined in this flow.</span>
                        )}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}


