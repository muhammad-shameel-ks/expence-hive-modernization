"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, List, Network, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminDepartment, AdminEmployee, AdminRole } from "@/server/admin/ports";
import { BulkImport } from "./bulk-import";
import { initials } from "./initials";
import { OrgTree } from "./org-tree";
import { SectionHeading } from "./section-heading";
import { StatusBadge } from "./status-badge";
import { UserCreateForm } from "./user-create-form";

type ActiveFilter = "all" | "active" | "deactivated";

type PeopleView = "list" | "tree";

export function PeopleSection({
  people,
  roles,
  departments,
  currentEmployeeId,
  onMessage,
  onError,
  onPeopleChange,
  onDepartmentsChange,
}: {
  people: AdminEmployee[];
  roles: AdminRole[];
  departments: AdminDepartment[];
  currentEmployeeId: string;
  onMessage: (message: string) => void;
  onError: (error: string) => void;
  onPeopleChange: (people: AdminEmployee[]) => void;
  onDepartmentsChange?: (departments: AdminDepartment[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All departments");
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [view, setView] = useState<PeopleView>("list");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const activeDepartments = useMemo(
    () => departments.filter((d) => d.active),
    [departments],
  );

  const activeRoles = useMemo(() => roles.filter((role) => role.active), [roles]);

  const departmentOptions = useMemo(
    () => ["All departments", ...new Set(people.map((person) => person.department))],
    [people],
  );

  const roleOptions = useMemo(() => {
    const names = new Set(roles.map((role) => role.displayName));
    for (const person of people) {
      if (person.role) names.add(person.role.displayName);
    }
    return ["All roles", ...[...names].sort()];
  }, [people, roles]);

  const filteredPeople = useMemo(
    () =>
      people.filter((person) => {
        const matchesQuery = `${person.name} ${person.email}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesDepartment =
          departmentFilter === "All departments" || person.department === departmentFilter;
        const matchesRole =
          roleFilter === "All roles" || person.role?.displayName === roleFilter;
        const matchesActive =
          activeFilter === "all" ||
          (activeFilter === "active" ? person.active : !person.active);
        return matchesQuery && matchesDepartment && matchesRole && matchesActive;
      }),
    [activeFilter, departmentFilter, people, query, roleFilter],
  );

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId],
  );

  const setActive = async (person: AdminEmployee, active: boolean) => {
    setSaving(person.id);
    onError("");
    try {
      const endpoint = active
        ? "/api/admin/employees/reactivate"
        : "/api/admin/employees/deactivate";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: person.id }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      onPeopleChange(
        people.map((item) => (item.id === person.id ? { ...item, active } : item)),
      );
      onMessage(active ? `${person.name} reactivated.` : `${person.name} deactivated.`);
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "conflict"
          ? "This person cannot be deactivated: either it is your own account or they are the last active Superadmin."
          : active
            ? "The reactivation could not be saved. Please try again."
            : "The deactivation could not be saved. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  };

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
      onPeopleChange(
        people.map((item) =>
          item.id === person.id
            ? { ...item, role: { id: role.id, code: role.code, displayName: role.displayName } }
            : item,
        ),
      );
      if (onDepartmentsChange && person.departmentId) {
        const isManager =
          role.code === "manager" ||
          role.code.includes("manager") ||
          role.displayName.toLowerCase().includes("manager");
        if (isManager) {
          onDepartmentsChange(
            departments.map((candidate) =>
              candidate.id === person.departmentId && (!candidate.headId || candidate.headId === "")
                ? { ...candidate, headId: person.id, head: { id: person.id, name: person.name } }
                : candidate,
            ),
          );
        }
      }
      onMessage(`${person.name} is now assigned to the ${role.displayName} role.`);
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can change roles."
          : "The role change could not be saved. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  };

  const assignDepartment = async (person: AdminEmployee, dept: AdminDepartment) => {
    setSaving(person.id);
    onError("");
    try {
      const response = await fetch("/api/admin/employee-department", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: person.id, departmentId: dept.id }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      onPeopleChange(
        people.map((item) =>
          item.id === person.id
            ? { ...item, department: dept.name, departmentId: dept.id }
            : item,
        ),
      );
      if (onDepartmentsChange) {
        const isManager =
          person.role?.code === "manager" ||
          person.role?.code?.includes("manager") ||
          person.role?.displayName?.toLowerCase().includes("manager");
        onDepartmentsChange(
          departments.map((candidate) => {
            if (candidate.id === dept.id && (!candidate.headId || candidate.headId === "") && isManager) {
              return { ...candidate, headId: person.id, head: { id: person.id, name: person.name } };
            }
            if (candidate.headId === person.id && candidate.id !== dept.id) {
              return { ...candidate, headId: null, head: null };
            }
            return candidate;
          }),
        );
      }
      onMessage(`${person.name} is now allocated to the ${dept.name} department.`);
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can change departments."
          : "The department change could not be saved. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  };

  const assignManager = async (person: AdminEmployee, managerId: string | null) => {
    setSaving(person.id);
    onError("");
    try {
      const response = await fetch("/api/admin/employees/manager", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: person.id, managerId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const manager = managerId
        ? people.find((candidate) => candidate.id === managerId)
        : null;
      onPeopleChange(
        people.map((item) => (item.id === person.id ? { ...item, managerId } : item)),
      );
      onMessage(
        manager
          ? `${person.name} now reports to ${manager.name}.`
          : `Manager assignment cleared for ${person.name}.`,
      );
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can change manager assignments."
          : "The manager change could not be saved. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <section id="people" className="mt-8" aria-labelledby="people-title">
      <SectionHeading
        number="1"
        icon={Users}
        title="People management"
        description="Search and filter people, assign roles, departments and managers, and deactivate or reactivate access."
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <UserCreateForm
          people={people}
          roles={roles}
          departments={departments}
          onCreated={(employee) => onPeopleChange([...people, employee])}
          onMessage={onMessage}
          onError={onError}
        />
        <BulkImport
          onImported={(imported) => onPeopleChange([...people, ...imported])}
          onMessage={onMessage}
          onError={onError}
        />
      </div>
      <div className="mt-5 rounded-[18px] border border-[#e0e7ee] bg-white shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#eef2f6] p-5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9aa6b5]" />
            <label className="sr-only" htmlFor="people-search">Search people</label>
            <input id="people-search" className="h-10 w-full rounded-lg border border-[#d6dfe8] bg-white pl-9 pr-3 text-sm text-[#33445c] outline-none placeholder:text-[#9aa6b5] focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]" placeholder="Search people..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <label className="sr-only" htmlFor="people-department">Filter by department</label>
          <select id="people-department" className="h-10 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
            {departmentOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="people-role">Filter by role</label>
          <select id="people-role" className="h-10 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            {roleOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="people-active">Filter by active state</label>
          <select id="people-active" className="h-10 rounded-lg border border-[#d6dfe8] bg-white px-3 text-xs font-semibold text-[#526278] outline-none focus:ring-2 focus:ring-[#b7d8e5]" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <div className="flex items-center gap-1 rounded-lg border border-[#d6dfe8] bg-[#fbfcfd] p-1" role="group" aria-label="People view">
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#8ab5c6] ${
                view === "list" ? "bg-white text-[#175d75] shadow-sm" : "text-[#7d8a9b] hover:text-[#26364b]"
              }`}
            >
              <List className="size-3.5" />
              List
            </button>
            <button
              type="button"
              aria-pressed={view === "tree"}
              onClick={() => setView("tree")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#8ab5c6] ${
                view === "tree" ? "bg-white text-[#175d75] shadow-sm" : "text-[#7d8a9b] hover:text-[#26364b]"
              }`}
            >
              <Network className="size-3.5" />
              Tree
            </button>
          </div>
        </div>
        {view === "list" ? (
          <>
            <div className="hidden grid-cols-[1.3fr_1fr_1fr_auto_auto] gap-4 border-b border-[#eef2f6] bg-[#fbfcfd] px-5 py-3 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#8a96a8] sm:grid">
              <span>Person</span>
              <span>Department</span>
              <span>Role</span>
              <span>Status</span>
              <span />
            </div>
            {filteredPeople.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                onOpen={() => setSelectedPersonId(person.id)}
              />
            ))}
          </>
        ) : (
          <OrgTree
            people={filteredPeople}
            departments={activeDepartments}
            onSelectPerson={(person) => setSelectedPersonId(person.id)}
          />
        )}
        {filteredPeople.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#7d8a9b]">No people match this search.</p>
        ) : null}
      </div>

      {selectedPerson ? (
        <PersonDrawer
          person={selectedPerson}
          people={people}
          roles={activeRoles}
          departments={activeDepartments}
          currentEmployeeId={currentEmployeeId}
          saving={saving === selectedPerson.id}
          onClose={() => setSelectedPersonId(null)}
          onRoleChange={(role) => assignRole(selectedPerson, role)}
          onDepartmentChange={(dept) => assignDepartment(selectedPerson, dept)}
          onManagerChange={(managerId) => assignManager(selectedPerson, managerId)}
          onSetActive={(active) => setActive(selectedPerson, active)}
        />
      ) : null}
    </section>
  );
}

function PersonRow({
  person,
  onOpen,
}: {
  person: AdminEmployee;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-1 gap-3 border-b border-[#eef2f6] px-5 py-4 text-left transition-colors last:border-0 hover:bg-[#fbfcfd] focus-visible:bg-[#fbfcfd] focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-[#8ab5c6] sm:grid-cols-[1.3fr_1fr_1fr_auto_auto] sm:items-center sm:gap-4"
      aria-label={`Open details for ${person.name}`}
    >
      <span className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eaf3f6] text-xs font-bold text-[#196d86]">{initials(person.name)}</span>
        <span className="min-w-0">
          <strong className="block truncate text-sm text-[#33445c]">{person.name}</strong>
          <span className="block truncate text-xs text-[#9aa6b5]">{person.email}</span>
        </span>
      </span>

      <span className="text-xs font-medium text-[#526278]">
        <span className="mb-0.5 block text-[0.62rem] uppercase tracking-wide text-[#a2adba] sm:hidden">Department</span>
        <span className="truncate">{person.department || "Unallocated"}</span>
      </span>

      <span className="text-xs font-medium text-[#526278]">
        <span className="mb-0.5 block text-[0.62rem] uppercase tracking-wide text-[#a2adba] sm:hidden">Role</span>
        <span className="truncate">{person.role?.displayName ?? "No role assigned"}</span>
      </span>

      <span className="text-xs">
        <span className="sr-only">Status</span>
        <StatusBadge active={person.active} />
      </span>

      <ChevronDown className="hidden size-4 -rotate-90 text-[#8a96a8] sm:block" />
    </button>
  );
}

function PersonDrawer({
  person,
  people,
  roles,
  departments,
  currentEmployeeId,
  saving,
  onClose,
  onRoleChange,
  onDepartmentChange,
  onManagerChange,
  onSetActive,
}: {
  person: AdminEmployee;
  people: AdminEmployee[];
  roles: AdminRole[];
  departments: AdminDepartment[];
  currentEmployeeId: string;
  saving: boolean;
  onClose: () => void;
  onRoleChange: (role: AdminRole) => void;
  onDepartmentChange: (dept: AdminDepartment) => void;
  onManagerChange: (managerId: string | null) => void;
  onSetActive: (active: boolean) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const setActiveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape closes the drawer even when focus has fallen back to the page
  // (e.g. after the Deactivate/Reactivate button is replaced on toggle).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Keep keyboard focus inside the drawer when the action button toggles.
  useEffect(() => {
    setActiveButtonRef.current?.focus();
  }, [person.active]);

  const isSelf = person.id === currentEmployeeId;
  const activeSuperadminCount = people.filter(
    (candidate) => candidate.active && candidate.role?.code === "superadmin",
  ).length;
  const isLastActiveSuperadmin =
    person.active && person.role?.code === "superadmin" && activeSuperadminCount === 1;
  const deactivationBlocked = isSelf || isLastActiveSuperadmin;
  const blockReason = isSelf
    ? "You cannot deactivate your own account."
    : isLastActiveSuperadmin
      ? "The last active Superadmin cannot be deactivated."
      : null;

  const managerOptions = people.filter((candidate) => candidate.id !== person.id);

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close person details"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-[#17273d]/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-detail-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-[0_18px_50px_rgba(23,39,61,0.28)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#eef2f6] p-6 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#eaf3f6] text-sm font-bold text-[#196d86]">{initials(person.name)}</span>
            <span className="min-w-0">
              <h2 id="person-detail-title" className="truncate text-base font-bold text-[#17273d]">{person.name}</h2>
              <p className="truncate text-xs text-[#9aa6b5]">{person.email}</p>
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close person details"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[#8a96a8] transition-colors hover:bg-[#f4f7fa] hover:text-[#33445c] focus-visible:outline-2 focus-visible:outline-[#8ab5c6]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#8a96a8]">Status</span>
            <div className="mt-1.5">
              <StatusBadge active={person.active} />
            </div>
          </div>

          <div>
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#8a96a8]">Current role</span>
            <p className="mt-1 text-sm font-semibold text-[#33445c]">
              {person.role?.displayName ?? "No role assigned"}
            </p>
          </div>

          <FieldLabel htmlFor="drawer-role">Assign role</FieldLabel>
          <div className="relative">
            <select
              id="drawer-role"
              aria-label={`Role for ${person.name}`}
              className="h-10 w-full appearance-none rounded-lg border border-[#d6dfe8] bg-white px-3 pr-8 text-xs font-semibold text-[#526278] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5] disabled:opacity-60"
              value={person.role?.id ?? ""}
              disabled={saving}
              onChange={(event) => {
                const role = roles.find((candidate) => candidate.id === event.target.value);
                if (role) onRoleChange(role);
              }}
            >
              <option value="" disabled>
                No role assigned
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.displayName}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#8a96a8]" />
          </div>

          <FieldLabel htmlFor="drawer-department">Assign department</FieldLabel>
          <div className="relative">
            <select
              id="drawer-department"
              aria-label={`Department for ${person.name}`}
              className="h-10 w-full appearance-none rounded-lg border border-[#d6dfe8] bg-white px-3 pr-8 text-xs font-semibold text-[#526278] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5] disabled:opacity-60"
              value={departments.find((d) => d.name === person.department || d.id === person.departmentId)?.id ?? ""}
              disabled={saving}
              onChange={(event) => {
                const dept = departments.find((candidate) => candidate.id === event.target.value);
                if (dept) onDepartmentChange(dept);
              }}
            >
              <option value="" disabled>
                Unallocated
              </option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#8a96a8]" />
          </div>

          <FieldLabel htmlFor="drawer-manager">Manager / team lead</FieldLabel>
          <div className="relative">
            <select
              id="drawer-manager"
              aria-label={`Manager for ${person.name}`}
              className="h-10 w-full appearance-none rounded-lg border border-[#d6dfe8] bg-white px-3 pr-8 text-xs font-semibold text-[#526278] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5] disabled:opacity-60"
              value={person.managerId ?? ""}
              disabled={saving}
              onChange={(event) => onManagerChange(event.target.value || null)}
            >
              <option value="">No manager</option>
              {managerOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id} disabled={!candidate.active}>
                  {candidate.name}
                  {candidate.active ? "" : " (deactivated)"}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#8a96a8]" />
          </div>
          <p className="text-xs text-[#9aa6b5]">
            {person.managerId
              ? `Reports to ${managerOptions.find((candidate) => candidate.id === person.managerId)?.name ?? "a team lead"}.`
              : "No reporting relationship assigned yet."}
          </p>
        </div>

        <div className="border-t border-[#eef2f6] p-6">
          {person.active ? (
            <>
              <Button
                ref={setActiveButtonRef}
                type="button"
                loading={saving}
                disabled={deactivationBlocked}
                onClick={() => onSetActive(false)}
                className="h-10 w-full bg-[#a8384d] px-4 text-xs font-bold text-white hover:bg-[#8f2f42]"
              >
                Deactivate account
              </Button>
              {blockReason ? (
                <p className="mt-2 text-xs font-medium text-[#a8384d]" role="note">
                  {blockReason}
                </p>
              ) : null}
            </>
          ) : (
            <Button
              ref={setActiveButtonRef}
              type="button"
              loading={saving}
              onClick={() => onSetActive(true)}
              className="h-10 w-full bg-[#23706b] px-4 text-xs font-bold text-white hover:bg-[#1c5a56]"
            >
              Reactivate account
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#8a96a8]">
      {children}
    </label>
  );
}
