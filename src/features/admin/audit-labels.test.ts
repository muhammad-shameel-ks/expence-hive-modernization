import { describe, expect, it } from "vitest";
import type { AdminEmployee } from "@/server/admin/ports";
import {
  AUDIT_ACTION_OPTIONS,
  actionLabel,
  actorName,
  formatTimestamp,
} from "./audit-labels";

function employee(id: string, name: string): AdminEmployee {
  return {
    id,
    organizationId: "org-1",
    name,
    email: `${id}@example.com`,
    department: "",
    departmentId: null,
    role: null,
    active: true,
    managerId: null,
  };
}

const people = [employee("emp-1", "Ada Lovelace"), employee("emp-2", "Grace Hopper")];

describe("actionLabel", () => {
  it("maps every documented audit action to a human label", () => {
    const labels = {
      "assign-role": "Role assigned",
      "assign-department": "Department assigned",
      "assign-manager": "Manager assigned",
      "deactivate-employee": "Employee deactivated",
      "reactivate-employee": "Employee reactivated",
      "create-department": "Department created",
      "deactivate-department": "Department deactivated",
      "create-role": "Role created",
      "deactivate-role": "Role deactivated",
      "create-flow-draft": "Flow draft created",
      "update-flow": "Flow updated",
      "publish-flow": "Flow published",
      "delete-flow": "Flow deleted",
    };
    for (const [action, label] of Object.entries(labels)) {
      expect(actionLabel(action)).toBe(label);
    }
  });

  it("falls back to the raw action string for unknown actions", () => {
    expect(actionLabel("future-action")).toBe("future-action");
  });

  it("keeps filter options in step with the label map", () => {
    expect(AUDIT_ACTION_OPTIONS.map((option) => option.action)).toEqual(
      Object.keys({
        "assign-role": 1,
        "assign-department": 1,
        "assign-manager": 1,
        "deactivate-employee": 1,
        "reactivate-employee": 1,
        "create-department": 1,
        "deactivate-department": 1,
        "create-role": 1,
        "deactivate-role": 1,
        "create-flow-draft": 1,
        "update-flow": 1,
        "publish-flow": 1,
        "delete-flow": 1,
      }),
    );
    for (const option of AUDIT_ACTION_OPTIONS) {
      expect(actionLabel(option.action)).toBe(option.label);
    }
  });
});

describe("actorName", () => {
  it("resolves a known actor id to the person's name", () => {
    expect(actorName(people, "emp-1")).toBe("Ada Lovelace");
  });

  it("falls back to the raw id when the actor is not in the people list", () => {
    expect(actorName(people, "emp-unknown")).toBe("emp-unknown");
  });

  it("ignores deactivated or removed people gracefully", () => {
    expect(actorName([employee("emp-1", "Ada Lovelace")], "emp-2")).toBe("emp-2");
  });
});

describe("formatTimestamp", () => {
  it("formats a valid ISO instant without throwing or reporting an invalid date", () => {
    const formatted = formatTimestamp("2026-08-06T12:00:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatted.toLowerCase()).not.toContain("invalid");
  });

  it("returns the raw value when the input is not a parseable date", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });
});
