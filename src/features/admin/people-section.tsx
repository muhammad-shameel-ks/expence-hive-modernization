"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Search, Users } from "lucide-react";
import type { AdminEmployee, AdminRole } from "@/server/admin/ports";
import { SectionHeading } from "./section-heading";

export function PeopleSection({
  people,
  roles,
  onMessage,
  onError,
}: {
  people: AdminEmployee[];
  roles: AdminRole[];
  onMessage: (message: string) => void;
  onError: (error: string) => void;
}) {
  const [peopleState, setPeopleState] = useState(people);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All departments");
  const [saving, setSaving] = useState<string | null>(null);

  const departmentOptions = useMemo(
    () => ["All departments", ...new Set(peopleState.map((person) => person.department))],
    [peopleState],
  );

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
    onError("");
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: person.id, roleId: role.id }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      setPeopleState((current) =>
        current.map((item) =>
          item.id === person.id
            ? { ...item, role: { id: role.id, code: role.code, displayName: role.displayName } }
            : item,
        ),
      );
      onMessage(`${person.name} is now assigned to the ${role.displayName} role.`);
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin and HR administrators can change roles."
          : "The role change could not be saved. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <section id="people" className="mt-11" aria-labelledby="people-title">
      <SectionHeading
        number="1"
        icon={Users}
        title="Assign people to roles"
        description="Roles control what each person can do in ExpenseHive."
      />
      <div className="mt-5 rounded-[18px] border border-[#e0e7ee] bg-white shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#eef2f6] p-5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9aa6b5]" />
            <label className="sr-only" htmlFor="people-search">Search people</label>
            <input id="people-search" className="h-10 w-full rounded-lg border border-[#d6dfe8] bg-white pl-9 pr-3 text-sm text-[#33445c] outline-none placeholder:text-[#9aa6b5] focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]" placeholder="Search people" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <label className="sr-only" htmlFor="people-department">Filter by department</label>
          <select id="people-department" className="h-10 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]" value={department} onChange={(event) => setDepartment(event.target.value)}>
            {departmentOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
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
            roles={roles}
            saving={saving === person.id}
            onRoleChange={(role) => assignRole(person, role)}
          />
        ))}
        {filteredPeople.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#7d8a9b]">No people match this search.</p>
        ) : null}
      </div>
    </section>
  );
}

function PersonRow({
  person,
  roles,
  saving,
  onRoleChange,
}: {
  person: AdminEmployee;
  roles: AdminRole[];
  saving: boolean;
  onRoleChange: (role: AdminRole) => void;
}) {
  const activeRoles = roles.filter((role) => role.active);
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
            value={person.role?.id ?? ""}
            disabled={saving}
            onChange={(event) => {
              const role = activeRoles.find((candidate) => candidate.id === event.target.value);
              if (role) onRoleChange(role);
            }}
          >
            <option value="" disabled>
              No role assigned
            </option>
            {activeRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.displayName}
              </option>
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
