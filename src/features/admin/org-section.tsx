"use client";

import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminDepartment, AdminRole } from "@/server/admin/ports";
import { SectionHeading } from "./section-heading";

export function OrgSection({
  departments,
  roles,
  onMessage,
  onError,
  onDepartmentsChange,
  onRolesChange,
}: {
  departments: AdminDepartment[];
  roles: AdminRole[];
  onMessage: (message: string) => void;
  onError: (error: string) => void;
  onDepartmentsChange: (departments: AdminDepartment[]) => void;
  onRolesChange: (roles: AdminRole[]) => void;
}) {
  const [departmentName, setDepartmentName] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [roleDisplayName, setRoleDisplayName] = useState("");
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  const createDepartment = async () => {
    setSavingDepartment(true);
    onError("");
    try {
      const response = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: departmentName }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as { department: AdminDepartment };
      onDepartmentsChange([...departments, body.department]);
      onMessage(`${body.department.name} department created.`);
      setDepartmentName("");
    } catch {
      onError("The department could not be saved. Please try again.");
    } finally {
      setSavingDepartment(false);
    }
  };

  const createRole = async () => {
    setSavingRole(true);
    onError("");
    try {
      const response = await fetch("/api/admin/org-roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: roleCode,
          displayName: roleDisplayName,
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as { role: AdminRole };
      onRolesChange([...roles, body.role]);
      onMessage(`${body.role.displayName} role created.`);
      setRoleCode("");
      setRoleDisplayName("");
    } catch {
      onError("The role could not be saved. Please try again.");
    } finally {
      setSavingRole(false);
    }
  };

  return (
    <section id="org" className="mt-11" aria-labelledby="org-title">
      <SectionHeading
        number="0"
        icon={Building2}
        title="Departments and roles"
        description="Superadmin defines departments and the roles inside them before people and flows can reference them."
      />
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
          <h3 className="text-sm font-semibold text-[#1c2f46]">New department</h3>
          <label className="mt-3 block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="department-name">
            Name
          </label>
          <input
            id="department-name"
            className="mt-2 h-10 w-full rounded-lg border border-[#d6dfe8] px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
            value={departmentName}
            onChange={(event) => setDepartmentName(event.target.value)}
            placeholder="Engineering"
          />
          <Button className="mt-4" disabled={savingDepartment || !departmentName.trim()} onClick={createDepartment}>
            <Plus /> Add department
          </Button>
          <ul className="mt-4 space-y-1 text-xs text-[#526278]">
            {departments.map((department) => (
              <li key={department.id}>
                {department.name}
                {department.active ? "" : " (inactive)"}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
          <h3 className="text-sm font-semibold text-[#1c2f46]">New role</h3>
          <label className="mt-3 block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="role-code">
            Code
          </label>
          <input
            id="role-code"
            className="mt-2 h-10 w-full rounded-lg border border-[#d6dfe8] px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
            value={roleCode}
            onChange={(event) => setRoleCode(event.target.value)}
            placeholder="team-lead"
          />
          <label className="mt-3 block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="role-display-name">
            Display name
          </label>
          <input
            id="role-display-name"
            className="mt-2 h-10 w-full rounded-lg border border-[#d6dfe8] px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
            value={roleDisplayName}
            onChange={(event) => setRoleDisplayName(event.target.value)}
            placeholder="Team Lead"
          />
          <Button
            className="mt-4"
            disabled={savingRole || !roleCode.trim() || !roleDisplayName.trim()}
            onClick={createRole}
          >
            <Plus /> Add role
          </Button>
          <ul className="mt-4 space-y-1 text-xs text-[#526278]">
            {roles.map((role) => (
              <li key={role.id} className="flex items-center gap-2">
                <span>{role.displayName}</span>
                {role.locked ? (
                  <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#5f6368]">
                    Locked
                  </span>
                ) : null}
                {role.active ? "" : <span className="text-[#a8384d]">(inactive)</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
