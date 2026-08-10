// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getJourneyFlowItems, JourneyFlow } from "./journey-flow";
import type { Expense } from "./mock-data";

function baseExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "claim-1",
    ref: "EXP-2026-0001",
    title: "Client dinner",
    category: "Meals",
    amount: 1200,
    currency: "INR",
    date: "Aug 1",
    submittedAt: "2026-08-01T00:00:00.000Z",
    status: "in-finance",
    attachments: [],
    history: [
      { id: "h1", date: "Aug 1", actor: "Muhammad Shameel", actorId: "emp-shameel", kind: "submitted" },
      {
        id: "h2",
        date: "Aug 2",
        actor: "Pramod",
        actorId: "emp-pramod",
        kind: "takeover",
        detail: "Took over as Finance Executive (reason: urgent); skipped 1 earlier stage(s): Manager",
      },
    ],
    steps: [
      { id: "step-1", roleId: "role-manager", roleName: "Manager", status: "skipped", assignedActorName: "Sanil" },
      {
        id: "step-2",
        roleId: "role-finance-executive",
        roleName: "Finance Executive",
        status: "pending",
        assignedActorName: "Rishikesh",
      },
    ],
    ...overrides,
  };
}

describe("getJourneyFlowItems takeover rendering", () => {
  it("titles a takeover entry with the bypassed stage's role name, not the actor or the generic label", () => {
    const steps = getJourneyFlowItems(baseExpense());
    const takeoverStep = steps.find((s) => s.isTakeover);
    expect(takeoverStep?.label).toBe("Manager");
  });

  it("describes who took over and why, since the title no longer names the actor", () => {
    const steps = getJourneyFlowItems(baseExpense());
    const takeoverStep = steps.find((s) => s.isTakeover);
    expect(takeoverStep?.detail).toBe('Taken over by Pramod for "urgent"');
  });

  it("marks non-takeover entries as isTakeover: false", () => {
    const steps = getJourneyFlowItems(baseExpense());
    const submitted = steps.find((s) => s.id === "h1");
    expect(submitted?.isTakeover).toBe(false);
  });
});

describe("JourneyFlow takeover rendering", () => {
  afterEach(cleanup);

  it("shows the bypassed role as the title, a 'Taken over' chip, and who/why in the description", () => {
    render(<JourneyFlow expense={baseExpense()} currentUserId="emp-shameel" />);

    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Taken over")).toBeInTheDocument();
    expect(screen.getByText('Taken over by Pramod for "urgent"')).toBeInTheDocument();
  });

  it("shows the 'Taken over' chip exactly once, next to the takeover entry only", () => {
    render(<JourneyFlow expense={baseExpense()} currentUserId="emp-shameel" />);

    expect(screen.getAllByText("Taken over")).toHaveLength(1);
  });
});
