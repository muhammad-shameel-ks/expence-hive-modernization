"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_ROLES, type AdminEmployee, type AdminRole, type FlowDraft } from "@/server/admin/ports";

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

export function AdminSetup({
  people,
  flows,
  operatorName,
}: {
  people: AdminEmployee[];
  flows: FlowDraft[];
  operatorName: string;
}) {
  const [peopleState, setPeopleState] = useState(people);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All departments");
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const filteredPeople = useMemo(
    () =>
      peopleState.filter((person) => {
        const matchesQuery = `${person.name} ${person.email}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesDepartment =
          department === "All departments" || person.department === department;
        return matchesQuery && matchesDepartment;
      }),
    [department, peopleState, query],
  );

  const assignRole = async (person: AdminEmployee, role: AdminRole) => {
    setSaving(person.id);
    setError("");
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: person.id, role }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      setPeopleState((current) =>
        current.map((item) => (item.id === person.id ? { ...item, role } : item)),
      );
      setMessage(`${person.name} is now assigned to the ${role} role.`);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only HR and system administrators can change roles."
          : "The role change could not be saved. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  };

  const saveFlowDraft = async () => {
    setSaving("flow");
    setError("");
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
      setMessage(`${flowName || "Flow"} saved as a draft for ${flowScope}.`);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only HR and system administrators can create flows."
          : "The flow could not be saved. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  };

  const addStep = () => {
    setSteps((current) => [...current, { id: Date.now(), role: newRole }]);
    setMessage(`${newRole} added to the flow.`);
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
    <main
      className="min-h-screen bg-[#f7f9fb] text-[#132035]"
      style={{ fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif" }}
    >
      <header className="sticky top-0 z-10 flex min-h-[72px] items-center justify-between gap-6 border-b border-[#e1e7ee] bg-white/95 px-[clamp(22px,4vw,56px)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-[10px] border border-[#c8d5e2] bg-[#f2f7fa] text-[#205b91]">
            <Network className="size-5" />
          </span>
          <span>
            <strong className="block text-[0.85rem] font-extrabold tracking-tight">
              ExpenseHive
            </strong>
            <span className="mt-px block text-[0.56rem] font-bold uppercase leading-none tracking-[0.13em] text-[#8a96a8]">
              administration
            </span>
          </span>
        </div>
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Administration">
          <a className="rounded-[9px] bg-[#e8f2f6] px-[13px] py-2 text-[0.76rem] font-semibold text-[#175d75]" href="#people">
            <Users className="mr-1.5 inline size-3.5" />
            People
          </a>
          <a className="rounded-[9px] px-[13px] py-2 text-[0.76rem] font-semibold text-[#7d8a9b] hover:bg-[#f4f7fa] hover:text-[#26364b]" href="#flow">
            <Workflow className="mr-1.5 inline size-3.5" />
            Flows
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-semibold text-[#526278] sm:inline">
            {operatorName}
          </span>
          <span className="grid size-[30px] place-items-center rounded-full border border-[#c9d8e4] bg-[#eef5f9] text-[0.8rem] font-extrabold text-[#175d75]">
            {operatorName.charAt(0)}
          </span>
        </div>
      </header>

      <div className="mx-auto w-[min(100%_-_44px,960px)] py-[clamp(48px,8vh,84px)] pb-28 max-[600px]:w-[min(100%_-_40px,520px)] max-[600px]:py-12">
        <div>
          <p className="m-0 text-[0.63rem] font-extrabold uppercase leading-[1.4] tracking-[0.18em] text-[#2e7fa4]">
            Admin setup
          </p>
          <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.4rem)] font-bold leading-none tracking-[-0.045em] text-[#17273d]">
            People and flows
          </h1>
          <p className="mt-3.5 max-w-2xl text-[0.95rem] text-[#7d8a9b]">
            Assign the right administration role to each person, then use those roles to build an approval flow.
          </p>
        </div>

        {error ? (
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-[#e8c4cb] bg-[#fdf0f2] px-4 py-3 text-sm font-medium text-[#a8384d]" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <section id="people" className="mt-11" aria-labelledby="people-title">
          <SectionHeading number="1" icon={Users} title="Assign people to roles" description="Roles control what each person can do in ExpenseHive." />
          <div className="mt-5 rounded-[18px] border border-[#e0e7ee] bg-white shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-[#eef2f6] p-5">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9aa6b5]" />
                <label className="sr-only" htmlFor="people-search">Search people</label>
                <input id="people-search" className="h-10 w-full rounded-lg border border-[#d6dfe8] bg-white pl-9 pr-3 text-sm text-[#33445c] outline-none placeholder:text-[#9aa6b5] focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]" placeholder="Search people" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <label className="sr-only" htmlFor="people-department">Filter by department</label>
              <select id="people-department" className="h-10 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]" value={department} onChange={(event) => setDepartment(event.target.value)}>
                <option>All departments</option>
                <option>Engineering</option>
                <option>Operations</option>
                <option>Finance</option>
                <option>IT</option>
                <option>Executive</option>
              </select>
            </div>
            <div className="hidden grid-cols-[1.5fr_0.8fr_1fr_auto] gap-4 border-b border-[#eef2f6] bg-[#fbfcfd] px-5 py-3 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#8a96a8] sm:grid">
              <span>Person</span>
              <span>Department</span>
              <span>Assigned role</span>
              <span />
            </div>
            {filteredPeople.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                saving={saving === person.id}
                onRoleChange={(role) => assignRole(person, role)}
              />
            ))}
            {filteredPeople.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#7d8a9b]">No people match this search.</p>
            ) : null}
          </div>
        </section>

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
                disabled={saving === "flow"}
                onClick={saveFlowDraft}
              >
                {saving === "flow" ? "Saving..." : "Save flow draft"}
                <ArrowRight />
              </Button>
            </div>
          </div>
        </section>
      </div>

      {message ? (
        <div className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[#c4e2dc] bg-white px-4 py-3 text-xs font-semibold text-[#23706b] shadow-[0_12px_30px_rgba(31,50,71,0.14)]" role="status">
          <CheckCircle2 className="size-4" />
          {message}
          <button aria-label="Dismiss message" className="text-[#8a96a8] hover:text-[#33445c]" onClick={() => setMessage("")}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </main>
  );
}

function SectionHeading({ number, icon: Icon, title, description }: { number: string; icon: typeof Users; title: string; description: string }) {
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

function PersonRow({ person, saving, onRoleChange }: { person: AdminEmployee; saving: boolean; onRoleChange: (role: AdminRole) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-[#eef2f6] px-5 py-4 last:border-0 sm:grid-cols-[1.5fr_0.8fr_1fr_auto] sm:items-center sm:gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-[#eaf3f6] text-xs font-bold text-[#196d86]">{initials(person.name)}</span>
        <span className="min-w-0">
          <strong className="block truncate text-sm text-[#33445c]">{person.name}</strong>
          <span className="block truncate text-xs text-[#9aa6b5]">{person.email}</span>
        </span>
      </div>
      <span className="text-xs text-[#526278]">
        <span className="mb-1 block text-[0.62rem] uppercase tracking-wide text-[#a2adba] sm:hidden">Department</span>
        {person.department}
      </span>
      <label className="text-xs text-[#526278]">
        <span className="mb-1 block text-[0.62rem] uppercase tracking-wide text-[#a2adba] sm:hidden">Assigned role</span>
        <span className="relative block">
          <select
            aria-label={`Role for ${person.name}`}
            className="h-9 w-full appearance-none rounded-lg border border-[#d6dfe8] bg-white px-3 pr-8 text-xs font-semibold text-[#526278] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5] disabled:opacity-60"
            value={person.role ?? "Employee"}
            disabled={saving}
            onChange={(event) => onRoleChange(event.target.value as AdminRole)}
          >
            {ADMIN_ROLES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#8a96a8]" />
        </span>
      </label>
      <span className="hidden size-7 place-items-center rounded-full bg-[#eaf6f4] text-[#23706b] sm:grid">
        <CheckCircle2 className="size-4" />
      </span>
    </div>
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
