"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronDown, Users } from "lucide-react";
import type { AdminDepartment, AdminEmployee } from "@/server/admin/ports";
import { initials } from "./initials";
import { groupPeopleByDepartment } from "./org-tree-model";
import { StatusBadge } from "./status-badge";

export function OrgTree({
  people,
  departments,
  onSelectPerson,
}: {
  people: AdminEmployee[];
  departments: AdminDepartment[];
  onSelectPerson: (person: AdminEmployee) => void;
}) {
  // Departments default to expanded; the set only tracks collapsed ones so a
  // department that appears later (e.g. after a filter change) is expanded.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const groups = useMemo(
    () => groupPeopleByDepartment(people, departments),
    [departments, people],
  );

  if (groups.length === 0) return null;

  const toggle = (groupId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <div className="p-3 sm:p-4">
      <div className="space-y-1">
        {groups.map((group) => {
          const groupId = group.department ? group.department.id : "no-department";
          const expanded = !collapsedIds.has(groupId);
          return (
            <div key={groupId}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`org-tree-people-${groupId}`}
                onClick={() => toggle(groupId)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#fbfcfd] focus-visible:outline-2 focus-visible:outline-[#8ab5c6]"
              >
                <ChevronDown
                  className={`size-4 shrink-0 text-[#8a96a8] transition-transform ${
                    expanded ? "" : "-rotate-90"
                  }`}
                />
                {group.department ? (
                  <Building2 className="size-4 shrink-0 text-[#196d86]" />
                ) : (
                  <Users className="size-4 shrink-0 text-[#8a96a8]" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1c2f46]">
                  {group.department ? group.department.name : "No department"}
                </span>
                <span
                  className="shrink-0 rounded-full bg-[#eef2f6] px-2 py-0.5 text-[0.62rem] font-bold text-[#526278]"
                  aria-label={`${group.people.length} ${group.people.length === 1 ? "member" : "members"}`}
                >
                  {group.people.length}
                </span>
              </button>
              {expanded ? (
                <ul id={`org-tree-people-${groupId}`} className="ml-6 border-l border-[#eef2f6] py-0.5">
                  {group.people.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => onSelectPerson(person)}
                        aria-label={`Open details for ${person.name}`}
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#fbfcfd] focus-visible:outline-2 focus-visible:outline-[#8ab5c6]"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eaf3f6] text-xs font-bold text-[#196d86]">
                          {initials(person.name)}
                        </span>
                        <span className="w-full min-w-0 sm:w-auto sm:flex-1">
                          <span className="block truncate text-sm text-[#33445c]">{person.name}</span>
                          <span className="block truncate text-xs text-[#9aa6b5]">{person.email}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[#f1f4f7] px-2 py-0.5 text-xs font-medium text-[#526278]">
                          {person.role?.displayName ?? "No role assigned"}
                        </span>
                        {person.active ? null : <StatusBadge active={false} />}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
