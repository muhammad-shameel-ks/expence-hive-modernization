import { describe, expect, it } from "vitest";
import {
  formatGuardAmount,
  guardSatisfied,
  minorToRupees,
  rupeesToMinor,
  simulateRoute,
  validateGuardAmount,
  validateGuardOperator,
  validateStepGuard,
} from "./flow-guard";

describe("rupeesToMinor", () => {
  it("converts whole rupees to paise", () => {
    expect(rupeesToMinor("5000")).toBe(500000);
  });

  it("converts rupees with paise to paise", () => {
    expect(rupeesToMinor("305.50")).toBe(30550);
    expect(rupeesToMinor("5000.5")).toBe(500050);
  });

  it("rejects malformed amounts", () => {
    expect(rupeesToMinor("")).toBeNull();
    expect(rupeesToMinor("12.345")).toBeNull();
    expect(rupeesToMinor("abc")).toBeNull();
    expect(rupeesToMinor("-5")).toBeNull();
  });
});

describe("minorToRupees", () => {
  it("renders paise as rupees, dropping a clean .00 suffix", () => {
    expect(minorToRupees(500000)).toBe("5000");
    expect(minorToRupees(30550)).toBe("305.50");
  });

  it("renders empty for a null guard", () => {
    expect(minorToRupees(null)).toBe("");
    expect(minorToRupees(undefined)).toBe("");
  });
});

describe("formatGuardAmount", () => {
  it("renders whole rupees without decimals and paise with two digits", () => {
    expect(formatGuardAmount(500000)).toBe("₹5000");
    expect(formatGuardAmount(30550)).toBe("₹305.50");
  });
});

describe("guardSatisfied", () => {
  it("obeys the boundary per operator", () => {
    expect(guardSatisfied({ operator: "gte", amountMinor: 500000 }, 500000)).toBe(true);
    expect(guardSatisfied({ operator: "gt", amountMinor: 500000 }, 500000)).toBe(false);
    expect(guardSatisfied({ operator: "lte", amountMinor: 500000 }, 500000)).toBe(true);
    expect(guardSatisfied({ operator: "lt", amountMinor: 500000 }, 500000)).toBe(false);
    expect(guardSatisfied({ operator: "gte", amountMinor: 500000 }, 600000)).toBe(true);
    expect(guardSatisfied({ operator: "lte", amountMinor: 500000 }, 600000)).toBe(false);
  });
});

describe("simulateRoute", () => {
  const steps = [
    {},
    { guard: { operator: "gte" as const, amountMinor: 500000 } },
    { guard: { operator: "gte" as const, amountMinor: 500000 } },
  ];

  it("marks guarded steps below the threshold as auto-skipped with the reason", () => {
    const route = simulateRoute(steps, 30000);
    expect(route.map((step) => step.runs)).toEqual([true, false, true]);
    expect(route[1].reason).toBe("Total ₹300 under ₹5000 guard");
  });

  it("runs every step for a total above the threshold", () => {
    const route = simulateRoute(steps, 600000);
    expect(route.every((step) => step.runs)).toBe(true);
    expect(route[1].reason).toBeUndefined();
  });

  it("never auto-skips the terminal step even when its guard fails", () => {
    const terminalGuarded = [
      {},
      { guard: { operator: "gte" as const, amountMinor: 500000 } },
      { guard: { operator: "gte" as const, amountMinor: 500000 } },
    ];
    const route = simulateRoute(terminalGuarded, 30000);
    expect(route[2].runs).toBe(true);
    expect(route[1].runs).toBe(false);
  });

  it("treats absent guards as run", () => {
    const route = simulateRoute([{}, {}], 30000);
    expect(route.every((step) => step.runs)).toBe(true);
  });
});

describe("validateGuardAmount", () => {
  it("accepts valid rupee amounts", () => {
    expect(validateGuardAmount("500")).toEqual({ isValid: true });
    expect(validateGuardAmount("305.50")).toEqual({ isValid: true });
  });

  it("rejects empty or whitespace inputs", () => {
    expect(validateGuardAmount("")).toEqual({
      isValid: false,
      error: "Guard amount is required.",
    });
    expect(validateGuardAmount("   ")).toEqual({
      isValid: false,
      error: "Guard amount is required.",
    });
    expect(validateGuardAmount(null)).toEqual({
      isValid: false,
      error: "Guard amount is required.",
    });
  });

  it("rejects malformed inputs", () => {
    expect(validateGuardAmount("abc")).toEqual({
      isValid: false,
      error: "Enter a valid amount in rupees (e.g. 500 or 500.50).",
    });
    expect(validateGuardAmount("12.345")).toEqual({
      isValid: false,
      error: "Enter a valid amount in rupees (e.g. 500 or 500.50).",
    });
  });

  it("rejects non-positive amounts", () => {
    expect(validateGuardAmount("0")).toEqual({
      isValid: false,
      error: "Guard amount must be greater than ₹0.",
    });
    expect(validateGuardAmount("-5")).toEqual({
      isValid: false,
      error: "Enter a valid amount in rupees (e.g. 500 or 500.50).",
    });
  });
});

describe("validateGuardOperator", () => {
  it("accepts valid operators", () => {
    expect(validateGuardOperator("gte")).toEqual({ isValid: true });
    expect(validateGuardOperator("gt")).toEqual({ isValid: true });
    expect(validateGuardOperator("lte")).toEqual({ isValid: true });
    expect(validateGuardOperator("lt")).toEqual({ isValid: true });
  });

  it("rejects empty or unknown operators", () => {
    expect(validateGuardOperator("")).toEqual({
      isValid: false,
      error: "Select a valid guard operator.",
    });
    expect(validateGuardOperator("invalid")).toEqual({
      isValid: false,
      error: "Select a valid guard operator.",
    });
    expect(validateGuardOperator(null)).toEqual({
      isValid: false,
      error: "Select a valid guard operator.",
    });
  });
});

describe("validateStepGuard", () => {
  it("validates steps with no guard as valid", () => {
    expect(validateStepGuard({ guard: null }, 0, 3)).toEqual({ isValid: true });
  });

  it("validates non-terminal steps with valid guard and amount", () => {
    expect(
      validateStepGuard(
        { guard: { operator: "gte", amountMinor: 50000 }, guardAmountInput: "500" },
        0,
        3,
      ),
    ).toEqual({
      isValid: true,
      operatorError: undefined,
      amountError: undefined,
    });
  });

  it("rejects terminal step carrying a guard", () => {
    expect(
      validateStepGuard(
        { guard: { operator: "gte", amountMinor: 50000 }, guardAmountInput: "500" },
        2,
        3,
      ),
    ).toEqual({
      isValid: false,
      terminalError: "The terminal step of a flow cannot be guarded.",
    });
  });

  it("rejects non-terminal step with invalid amount input", () => {
    expect(
      validateStepGuard(
        { guard: { operator: "gte", amountMinor: 0 }, guardAmountInput: "abc" },
        0,
        3,
      ),
    ).toEqual({
      isValid: false,
      operatorError: undefined,
      amountError: "Enter a valid amount in rupees (e.g. 500 or 500.50).",
    });

    expect(
      validateStepGuard(
        { guard: { operator: "gte", amountMinor: 0 }, guardAmountInput: "0" },
        0,
        3,
      ),
    ).toEqual({
      isValid: false,
      operatorError: undefined,
      amountError: "Guard amount must be greater than ₹0.",
    });
  });

  it("rejects non-terminal step with empty or unknown operator", () => {
    expect(
      validateStepGuard(
        {
          guard: { operator: "" as unknown as "gte", amountMinor: 50000 },
          guardAmountInput: "500",
        },
        0,
        3,
      ),
    ).toEqual({
      isValid: false,
      operatorError: "Select a valid guard operator.",
      amountError: undefined,
    });
  });
});
