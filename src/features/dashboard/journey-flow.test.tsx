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
        actor: "Super Boss",
        actorId: "emp-super",
        kind: "delegated",
        detail: 'Delegated to Rishikesh (Finance Executive) for "urgent"',
      },
      {
        id: "h3",
        date: "Aug 2",
        actor: "Super Boss",
        actorId: "emp-super",
        kind: "skipped",
        detail: "Skipped: delegated to Rishikesh",
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

describe("getJourneyFlowItems delegation rendering", () => {
  it("renders the delegated entry with its own label and detail", () => {
    const steps = getJourneyFlowItems(baseExpense());
    const delegatedStep = steps.find((s) => s.id === "h2");
    expect(delegatedStep?.label).toBe("Delegated");
    expect(delegatedStep?.detail).toBe('Delegated to Rishikesh (Finance Executive) for "urgent"');
    expect(delegatedStep?.actor).toBe("Super Boss");
  });

  it("renders each delegation skip as its own stage-skipped entry", () => {
    const steps = getJourneyFlowItems(baseExpense());
    const skippedSteps = steps.filter((s) => s.detail === "Skipped: delegated to Rishikesh");
    expect(skippedSteps).toHaveLength(1);
    expect(skippedSteps[0]?.label).toBe("Stage skipped");
    expect(skippedSteps[0]?.actor).toBe("Super Boss");
  });

  it("marks non-delegated entries with the generic label", () => {
    const steps = getJourneyFlowItems(baseExpense());
    const submitted = steps.find((s) => s.id === "h1");
    expect(submitted?.label).toBe("Submitted");
    expect(submitted?.detail).toBeUndefined();
  });

  it("attributes a delegated skip to the step the delegation actually skipped, not an earlier absence-skipped stage", () => {
    // The Team Lead step was vacancy-skipped at submission (a "skipped"
    // event with no skipReason, same shape as a delegation skip), before the
    // delegation skipped only the Manager step further along.
    const expense = baseExpense({
      history: [
        { id: "h1", date: "Aug 1", actor: "Muhammad Shameel", actorId: "emp-shameel", kind: "submitted" },
        { id: "h2", date: "Aug 1", actor: "System", kind: "skipped", detail: "Skipped: no active employee holds this stage" },
        {
          id: "h3",
          date: "Aug 2",
          actor: "Super Boss",
          actorId: "emp-super",
          kind: "delegated",
          detail: 'Delegated to Rishikesh (Finance Executive) for "urgent"',
        },
        {
          id: "h4",
          date: "Aug 2",
          actor: "Super Boss",
          actorId: "emp-super",
          kind: "skipped",
          detail: "Skipped: delegated to Rishikesh",
        },
      ],
      steps: [
        { id: "step-0", roleId: null, roleName: "Team Lead", status: "skipped", assignedActorName: undefined },
        { id: "step-1", roleId: "role-manager", roleName: "Manager", status: "skipped", assignedActorName: "Sanil" },
        {
          id: "step-2",
          roleId: "role-finance-executive",
          roleName: "Finance Executive",
          status: "pending",
          assignedActorName: "Rishikesh",
        },
      ],
    });

    const steps = getJourneyFlowItems(expense);
    // Two standalone skipped entries: the vacancy skip and the delegation skip.
    const skippedEntries = steps.filter((s) => s.label === "Stage skipped");
    expect(skippedEntries).toHaveLength(2);
    expect(skippedEntries[0]?.detail).toBe("Skipped: no active employee holds this stage");
    expect(skippedEntries[1]?.detail).toBe("Skipped: delegated to Rishikesh");
    expect(steps.find((s) => s.label === "Delegated")).toBeDefined();
  });
});

describe("JourneyFlow delegation rendering", () => {
  afterEach(cleanup);

  it("shows the delegated entry with who and why in the description", () => {
    render(<JourneyFlow expense={baseExpense()} currentUserId="emp-shameel" />);

    expect(screen.getByText("Delegated")).toBeInTheDocument();
    expect(screen.getByText('Delegated to Rishikesh (Finance Executive) for "urgent"')).toBeInTheDocument();
    expect(screen.getAllByText("Super Boss").length).toBeGreaterThan(0);
  });

  it("shows the delegation skip entry next to the delegated entry", () => {
    render(<JourneyFlow expense={baseExpense()} currentUserId="emp-shameel" />);

    expect(screen.getByText("Stage skipped")).toBeInTheDocument();
    expect(screen.getByText("Skipped: delegated to Rishikesh")).toBeInTheDocument();
  });
});
