"use client";

import { useState } from "react";
import { Building2, Plus, ShieldCheck } from "lucide-react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminDepartment, AdminEmployee, AdminRole } from "@/server/admin/ports";
import type { PendingRoleStepClaim, RoleCapabilityImpact } from "@/server/admin/commands";
import {
  ACTION_PRIVILEGE_LABELS,
  SUBMIT_ONLY_CAPABILITIES,
  SUPERADMIN_CAPABILITIES,
  SUPERADMIN_ROLE_CODE,
  resolveRoleCapabilities,
  type RoleCapabilities,
} from "@/server/shared/authorization";
import { SectionHeading } from "./section-heading";

// The fixed six-privilege catalog (ADR-0015). Delegation and company
// auto-skip configuration are Superadmin-only built-ins and never appear as
// toggles. An action privilege (approve / finance verify-pay) may not be
// removed while claims are pending at the role's steps without the
// administrator confirming the removal and its impact.
const CAPABILITY_LABELS: { key: keyof RoleCapabilities; label: string }[] = [
  { key: "canSubmit", label: "Submit claims" },
  { key: "canApprove", label: "Approve and reject" },
  { key: "canAccessFinance", label: "Finance verify and pay" },
  { key: "canHold", label: "Hold claims" },
  { key: "canViewOrganizationActivity", label: "View org-wide activity" },
  { key: "canAccessAdminConsole", label: "Access the admin console" },
];

function PrivilegeSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-[#c7d2dd] bg-[#dde5ec] outline-none transition-colors data-[state=checked]:border-[#8ab5c6] data-[state=checked]:bg-[#196d86] focus-visible:ring-2 focus-visible:ring-[#b7d8e5] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

// The unconfirmed-removal warning state: the proposed capability set is kept
// so the confirm action can re-send it with confirmed: true.
type RemovalDialogState = {
  role: AdminRole;
  capabilities: RoleCapabilities;
  impact: RoleCapabilityImpact;
  confirming: boolean;
};

export function OrgSection({
  departments,
  roles,
  people,
  onMessage,
  onError,
  onDepartmentsChange,
  onRolesChange,
}: {
  departments: AdminDepartment[];
  roles: AdminRole[];
  people: AdminEmployee[];
  onMessage: (message: string) => void;
  onError: (error: string) => void;
  onDepartmentsChange: (departments: AdminDepartment[]) => void;
  onRolesChange: (roles: AdminRole[]) => void;
}) {
  const [departmentName, setDepartmentName] = useState("");
  const [departmentHeadId, setDepartmentHeadId] = useState("");
  const [savingHead, setSavingHead] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState("");
  const [roleDisplayName, setRoleDisplayName] = useState("");
  const [newRoleCapabilities, setNewRoleCapabilities] = useState<RoleCapabilities>({
    ...SUBMIT_ONLY_CAPABILITIES,
  });
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingCapabilitiesRoleId, setSavingCapabilitiesRoleId] = useState<string | null>(null);
  const [removalDialog, setRemovalDialog] = useState<RemovalDialogState | null>(null);

  const activeEmployees = people.filter((person) => person.active);

  const createDepartment = async () => {
    setSavingDepartment(true);
    onError("");
    try {
      const response = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: departmentName, headId: departmentHeadId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as { department: AdminDepartment };
      onDepartmentsChange([...departments, body.department]);
      onMessage(
        `${body.department.name} department created, headed by ${body.department.head?.name ?? "a head"}.`,
      );
      setDepartmentName("");
      setDepartmentHeadId("");
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can create departments."
          : "The department could not be saved. Please try again.",
      );
    } finally {
      setSavingDepartment(false);
    }
  };

  const changeHead = async (department: AdminDepartment, headId: string) => {
    setSavingHead(department.id);
    onError("");
    try {
      const response = await fetch("/api/admin/departments/head", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ departmentId: department.id, headId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const head = activeEmployees.find((person) => person.id === headId);
      onDepartmentsChange(
        departments.map((candidate) =>
          candidate.id === department.id
            ? {
                ...candidate,
                headId,
                head: head ? { id: head.id, name: head.name } : null,
              }
            : candidate,
        ),
      );
      onMessage(
        head
          ? `${head.name} is now the head of the ${department.name} department.`
          : `Head of ${department.name} updated.`,
      );
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only admin-console roles can change department heads."
          : "The head could not be saved. Please try again.",
      );
    } finally {
      setSavingHead(null);
    }
  };

  const resetRoleForm = () => {
    setRoleCode("");
    setRoleDisplayName("");
    setNewRoleCapabilities({ ...SUBMIT_ONLY_CAPABILITIES });
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
          capabilities: newRoleCapabilities,
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as { role: AdminRole };
      onRolesChange([...roles, body.role]);
      onMessage(`${body.role.displayName} role created.`);
      resetRoleForm();
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can create roles."
          : "The role could not be saved. Please try again.",
      );
    } finally {
      setSavingRole(false);
    }
  };

  // Applies the server's authoritative role record after a capability save
  // and reports the removal's consequence for pending steps at the role
  // (ADR-0015). A step at the terminal stage never auto-skips, so those
  // claims are called out as stranded rather than skipping forward.
  const applyRoleUpdate = (updated: AdminRole, pendingClaims: PendingRoleStepClaim[]) => {
    onRolesChange(
      roles.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );
    const skipping = pendingClaims.filter((claim) => claim.willSkip).length;
    const stranded = pendingClaims.length - skipping;
    const parts: string[] = [];
    if (skipping > 0) {
      parts.push(`${skipping} pending ${skipping === 1 ? "step" : "steps"} at this role will skip forward.`);
    }
    if (stranded > 0) {
      parts.push(
        `${stranded} pending ${stranded === 1 ? "claim" : "claims"} at this role's terminal stage will remain pending with no eligible actor.`,
      );
    }
    onMessage(
      parts.length > 0 ? `${updated.displayName} privileges saved. ${parts.join(" ")}` : `${updated.displayName} privileges saved.`,
    );
  };

  const toggleCapability = async (role: AdminRole, key: keyof RoleCapabilities, enabled: boolean) => {
    const before = resolveRoleCapabilities(role);
    if (before[key] === enabled) return;
    const next = { ...before, [key]: enabled };
    setSavingCapabilitiesRoleId(role.id);
    onError("");
    try {
      const response = await fetch("/api/admin/org-roles/capabilities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleId: role.id, capabilities: next }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string; impact?: RoleCapabilityImpact };
        // The unconfirmed removal of an action privilege with claims pending
        // at the role's steps comes back as a 409 carrying the full impact:
        // the warning dialog renders it and only confirms the removal on the
        // administrator's say-so. Nothing has changed yet, so canceling the
        // dialog leaves the role exactly as it was.
        if (response.status === 409 && body.impact) {
          setRemovalDialog({ role, capabilities: next, impact: body.impact, confirming: false });
          return;
        }
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as {
        role: AdminRole;
        pendingClaims: PendingRoleStepClaim[];
      };
      applyRoleUpdate(body.role, body.pendingClaims);
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can change role privileges."
          : "The role privileges could not be saved. Please try again.",
      );
    } finally {
      setSavingCapabilitiesRoleId(null);
    }
  };

  const confirmRemoval = async () => {
    if (!removalDialog) return;
    const { role, capabilities } = removalDialog;
    setRemovalDialog({ ...removalDialog, confirming: true });
    onError("");
    try {
      const response = await fetch("/api/admin/org-roles/capabilities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleId: role.id, capabilities, confirmed: true }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as {
        role: AdminRole;
        pendingClaims: PendingRoleStepClaim[];
      };
      setRemovalDialog(null);
      applyRoleUpdate(body.role, body.pendingClaims);
    } catch (caught) {
      setRemovalDialog((dialog) => (dialog ? { ...dialog, confirming: false } : dialog));
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can change role privileges."
          : "The role privileges could not be saved. Please try again.",
      );
    }
  };

  const removalLabels = removalDialog
    ? removalDialog.impact.removedActionPrivileges
        .map((privilege) => ACTION_PRIVILEGE_LABELS[privilege])
        .join(" and ")
    : "";
  const removalClaimCount = removalDialog?.impact.pendingClaims.length ?? 0;

  return (
    <section id="org" className="mt-11" aria-labelledby="org-title">
      <SectionHeading
        number="0"
        icon={Building2}
        title="Departments and roles"
        description="Superadmin defines departments - each with a head - and the roles inside them before people and flows can reference them."
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
          <label className="mt-3 block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]" htmlFor="department-head">
            Head
          </label>
          <select
            id="department-head"
            className="mt-2 h-10 w-full appearance-none rounded-lg border border-[#d6dfe8] bg-white px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
            value={departmentHeadId}
            onChange={(event) => setDepartmentHeadId(event.target.value)}
          >
            <option value="" disabled>
              Choose the department head
            </option>
            {activeEmployees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <Button
            className="mt-4"
            disabled={savingDepartment || !departmentName.trim() || !departmentHeadId}
            onClick={createDepartment}
          >
            <Plus /> Add department
          </Button>
          <ul className="mt-4 space-y-2 text-xs text-[#526278]">
            {departments.map((department) => (
              <li key={department.id} className="rounded-lg border border-[#eef2f6] p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#33445c]">{department.name}</span>
                  {department.active ? "" : <span className="text-[#a8384d]">(inactive)</span>}
                  {department.headId ? (
                    <span className="rounded-full bg-[#eaf3f6] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#196d86]">
                      Head: {department.head?.name ?? "assigned"}
                    </span>
                  ) : (
                    <span
                      className="rounded-full bg-[#fdf0f2] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#a8384d]"
                      role="note"
                    >
                      No head - incomplete
                    </span>
                  )}
                </div>
                <label className="sr-only" htmlFor={`department-head-${department.id}`}>
                  Change head of {department.name}
                </label>
                <select
                  id={`department-head-${department.id}`}
                  className="mt-2 h-8 w-full rounded-lg border border-[#d6dfe8] bg-white px-2 text-xs font-semibold text-[#526278] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5] disabled:opacity-60"
                  value={department.headId ?? ""}
                  disabled={savingHead === department.id || !department.active}
                  onChange={(event) => changeHead(department, event.target.value)}
                >
                  <option value="" disabled>
                    No head assigned
                  </option>
                  {activeEmployees.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
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
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]">
            Privileges
          </p>
          <ul className="mt-2 space-y-2.5 text-xs text-[#526278]">
            {CAPABILITY_LABELS.map(({ key, label }) => (
              <li key={key} className="flex items-center justify-between gap-3">
                <span>{label}</span>
                <PrivilegeSwitch
                  checked={newRoleCapabilities[key]}
                  disabled={savingRole}
                  label={`${label} for the new role`}
                  onChange={(enabled) =>
                    setNewRoleCapabilities((current) => ({ ...current, [key]: enabled }))
                  }
                />
              </li>
            ))}
          </ul>
          <Button
            className="mt-4"
            disabled={savingRole || !roleCode.trim() || !roleDisplayName.trim()}
            onClick={createRole}
          >
            <Plus /> Add role
          </Button>
        </div>
      </div>
      <div className="mt-5 rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#196d86]" />
          <div>
            <h3 className="text-sm font-semibold text-[#1c2f46]">Role privileges</h3>
            <p className="mt-1 text-xs text-[#7d8a9b]">
              Each role holds six privileges. Removing approve or finance verify/pay while claims
              are pending at the role&apos;s steps warns before applying: those pending steps skip
              forward on the next absence sweep, except at the terminal stage, which never
              auto-skips and is called out separately. Delegation and company auto-skip
              configuration are Superadmin-only built-ins and never appear as toggles.
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-4 text-xs text-[#526278]">
          {roles.map((role) => {
            const isSuperadmin = role.code === SUPERADMIN_ROLE_CODE;
            const capabilities = isSuperadmin
              ? SUPERADMIN_CAPABILITIES
              : resolveRoleCapabilities(role);
            const saving = savingCapabilitiesRoleId === role.id;
            return (
              <li
                key={role.id}
                className="rounded-xl border border-[#eef2f6] p-4"
                aria-label={`${role.displayName} role`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#33445c]">{role.displayName}</span>
                  <code className="rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[0.65rem] font-semibold text-[#5f6368]">
                    {role.code}
                  </code>
                  {isSuperadmin ? (
                    <span className="rounded-full bg-[#eaf3f6] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#196d86]">
                      Built-in console owner
                    </span>
                  ) : role.locked ? (
                    <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#5f6368]">
                      Locked
                    </span>
                  ) : null}
                  {role.active ? "" : <span className="text-[#a8384d]">(inactive)</span>}
                </div>
                <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {CAPABILITY_LABELS.map(({ key, label }) => (
                    <li key={key} className="flex items-center justify-between gap-3">
                      <span>{label}</span>
                      {isSuperadmin ? (
                        <span className="rounded-full bg-[#eaf3f6] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[#196d86]">
                          On
                        </span>
                      ) : (
                        <PrivilegeSwitch
                          checked={capabilities[key]}
                          disabled={saving || !role.active}
                          label={`${role.displayName} ${label}`}
                          onChange={(enabled) => toggleCapability(role, key, enabled)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog
        open={removalDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRemovalDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove a role privilege?</DialogTitle>
            <DialogDescription>
              {`Removing ${removalLabels} affects ${removalClaimCount} pending claim${
                removalClaimCount === 1 ? "" : "s"
              } at this role's steps. Pending steps skip forward on the next absence sweep, except at the terminal stage, which stays pending with no eligible actor.`}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-xs text-[#526278]">
            {removalDialog?.impact.pendingClaims.map((claim) => (
              <li
                key={claim.ref}
                className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-[#eef2f6] bg-[#fafbfc] px-3 py-2"
              >
                <span className="font-bold text-[#33445c]">{claim.ref}</span>
                <span>{claim.title}</span>
                <span className="text-[#8a96a8]">
                  {claim.requesterName} · {claim.stage}
                </span>
                {!claim.willSkip ? (
                  <span className="rounded-full bg-[#fdf0f2] px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-[#a8384d]">
                    Will not skip
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={removalDialog?.confirming}
              onClick={() => setRemovalDialog(null)}
            >
              Cancel
            </Button>
            <Button disabled={removalDialog?.confirming} onClick={confirmRemoval}>
              Confirm removal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
