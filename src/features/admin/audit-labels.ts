import type { AdminEmployee } from "@/server/admin/ports";

// Pure view-model helpers for the audit log surface: human action labels,
// actor-name lookups and timestamp formatting. Kept framework-free so the
// mapping can be unit tested without a component testing setup.

export type AuditActionOption = {
  action: string;
  label: string;
};

// The audit actions written by the admin commands layer, in filter-option
// order (people, then departments, then roles, then flows).
export const AUDIT_ACTION_OPTIONS: AuditActionOption[] = [
  { action: "assign-role", label: "Role assigned" },
  { action: "assign-department", label: "Department assigned" },
  { action: "assign-manager", label: "Manager assigned" },
  { action: "deactivate-employee", label: "Employee deactivated" },
  { action: "reactivate-employee", label: "Employee reactivated" },
  { action: "create-department", label: "Department created" },
  { action: "deactivate-department", label: "Department deactivated" },
  { action: "create-role", label: "Role created" },
  { action: "deactivate-role", label: "Role deactivated" },
  { action: "create-flow-draft", label: "Flow draft created" },
  { action: "update-flow", label: "Flow updated" },
  { action: "publish-flow", label: "Flow published" },
  { action: "delete-flow", label: "Flow deleted" },
];

const ACTION_LABELS = new Map(
  AUDIT_ACTION_OPTIONS.map((option) => [option.action, option.label]),
);

// Unknown actions (e.g. future audit kinds) render as their raw code so the
// trail stays readable instead of silently collapsing into a fallback label.
export function actionLabel(action: string): string {
  return ACTION_LABELS.get(action) ?? action;
}

export function actorName(people: AdminEmployee[], actorId: string): string {
  return people.find((person) => person.id === actorId)?.name ?? actorId;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
