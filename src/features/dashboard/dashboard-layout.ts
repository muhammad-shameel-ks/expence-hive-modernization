// Role-adaptive dashboard layouts (ADR-0027): below the stat cards, the
// dashboard's main sections - the expense overview, the "needs your
// attention" card, and the activity feed - are arranged per the viewer's
// role through one declarative map. Order and sizing are data in this
// module, not conditionals scattered through the render, so a future
// per-company layout setting can replace the map without rewriting the
// dashboard. The stat cards keep their own role-adaptive behavior
// (ADR-0020) and are untouched by this map.

import type { DashboardView } from "@/server/expenses/dashboard-read-models";
import { SUPERADMIN_ROLE_CODE } from "@/server/shared/authorization";

/** The dashboard sections a layout can arrange. */
export type DashboardLayoutSection = "overview" | "attention" | "activity";

export interface DashboardSectionLayout {
  /** Which section renders in this slot. */
  section: DashboardLayoutSection;
  /** Render order within the layout; lower orders render first. */
  order: number;
  /** The slot's sizing classes in the shared responsive grid. */
  className: string;
}

export interface DashboardLayoutSpec {
  /** The shared grid the slots participate in; it collapses to one column below lg, so every layout stays 320px safe. */
  gridClassName: string;
  sections: DashboardSectionLayout[];
}

export type DashboardLayoutKey = "employee" | "approver" | "finance" | "superadmin" | "default";

// The full-width slot class: a section spans both grid tracks on large
// screens and the whole width below lg.
const FULL_WIDTH = "lg:col-span-2";

// The shared track template: two uneven columns on large screens (the
// admin-first default splits the overview and the attention card 1.6fr/1fr),
// one column below lg.
const GRID = "grid gap-4 lg:grid-cols-[1.6fr_1fr]";

// The built-in admin-first arrangement, shared by the superadmin layout and
// the unknown-role default: the overview in the wider track with the
// attention card beside it, the activity feed full width below.
const ADMIN_FIRST_SECTIONS: DashboardSectionLayout[] = [
  { section: "overview", order: 1, className: "" },
  { section: "attention", order: 2, className: "" },
  { section: "activity", order: 3, className: FULL_WIDTH },
];

export const DASHBOARD_LAYOUTS: Record<DashboardLayoutKey, DashboardLayoutSpec> = {
  // Employee: the expense list is the primary surface, full width first;
  // the attention card follows when it has content, then the activity feed.
  employee: {
    gridClassName: GRID,
    sections: [
      { section: "overview", order: 1, className: FULL_WIDTH },
      { section: "attention", order: 2, className: FULL_WIDTH },
      { section: "activity", order: 3, className: FULL_WIDTH },
    ],
  },
  // Approver and finance: "needs your attention" leads the page full width
  // (wider than its old 1fr side-column), with the expense list below it.
  approver: {
    gridClassName: GRID,
    sections: [
      { section: "attention", order: 1, className: FULL_WIDTH },
      { section: "overview", order: 2, className: FULL_WIDTH },
      { section: "activity", order: 3, className: FULL_WIDTH },
    ],
  },
  finance: {
    gridClassName: GRID,
    sections: [
      { section: "attention", order: 1, className: FULL_WIDTH },
      { section: "overview", order: 2, className: FULL_WIDTH },
      { section: "activity", order: 3, className: FULL_WIDTH },
    ],
  },
  // Superadmin keeps the admin-first default arrangement.
  superadmin: { gridClassName: GRID, sections: ADMIN_FIRST_SECTIONS },
  // Unknown roles fall back to the same neutral arrangement.
  default: { gridClassName: GRID, sections: ADMIN_FIRST_SECTIONS },
};

// The seeded role codes resolve to their hardcoded layout by code
// (ADR-0027 layouts are per-role, not admin-configurable). Custom roles are
// not enumerable by code, so they resolve through the capability-derived
// dashboard view (ADR-0020): approving custom roles read like the approver
// layout, finance-capable ones like the finance layout, and everything else
// falls back to the default arrangement.
const LAYOUT_KEY_BY_ROLE_CODE: Partial<Record<string, DashboardLayoutKey>> = {
  employee: "employee",
  executive: "employee",
  intern: "employee",
  manager: "approver",
  "finance-head": "finance",
  "finance-executive": "finance",
  [SUPERADMIN_ROLE_CODE]: "superadmin",
};

/** Resolves the layout key for the viewer's role: known codes map directly, unknown and custom roles resolve by capability view, with the default as the final fallback. */
export function layoutKeyForRole(view: DashboardView, roleCode?: string): DashboardLayoutKey {
  const byCode = roleCode ? LAYOUT_KEY_BY_ROLE_CODE[roleCode] : undefined;
  if (byCode) return byCode;
  if (view === "approver") return "approver";
  if (view === "finance") return "finance";
  return "default";
}

export function dashboardLayoutForRole(view: DashboardView, roleCode?: string): DashboardLayoutSpec {
  return DASHBOARD_LAYOUTS[layoutKeyForRole(view, roleCode)];
}

/** The sections actually rendered for a layout: the attention section is dropped when it has no items (never an empty panel), and a lone side-by-side slot stretches full width so the grid never leaves an empty track. */
export function renderableSections(spec: DashboardLayoutSpec, attentionCount: number): DashboardSectionLayout[] {
  const shown = spec.sections
    .filter((slot) => slot.section !== "attention" || attentionCount > 0)
    .sort((a, b) => a.order - b.order);
  const paired = shown.filter((slot) => !slot.className.includes("col-span"));
  if (paired.length === 1) {
    return shown.map((slot) => (slot === paired[0] ? { ...slot, className: FULL_WIDTH } : slot));
  }
  return shown;
}
