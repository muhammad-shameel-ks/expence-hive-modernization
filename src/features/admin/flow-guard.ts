import {
  formatGuardAmount,
  GUARD_FAIL_PHRASES,
  guardSatisfied,
  minorToRupees,
  rupeesToMinor,
  type AmountGuard,
} from "@/server/shared/amount-guard";

export type { AmountGuard, AmountGuardOperator } from "@/server/shared/amount-guard";
export {
  autoSkipDetail,
  formatGuardAmount,
  GUARD_FAIL_PHRASES,
  GUARD_OPERATOR_LABELS,
  GUARD_OPERATORS,
  guardFromRow,
  guardSatisfied,
  minorToRupees,
  rupeesToMinor,
  simplifyAutoSkipDetail,
} from "@/server/shared/amount-guard";

export type SimulatedStep = {
  index: number;
  guard: AmountGuard | null;
  runs: boolean;
  reason?: string;
};

export type StepGuardValidation = {
  isValid: boolean;
  operatorError?: string;
  amountError?: string;
  terminalError?: string;
};

export function validateGuardAmount(amountInput: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (amountInput === undefined || amountInput === null || amountInput.trim() === "") {
    return { isValid: false, error: "Guard amount is required." };
  }
  const minor = rupeesToMinor(amountInput);
  if (minor === null) {
    return { isValid: false, error: "Enter a valid amount in rupees (e.g. 500 or 500.50)." };
  }
  if (minor <= 0) {
    return { isValid: false, error: "Guard amount must be greater than ₹0." };
  }
  return { isValid: true };
}

export function validateGuardOperator(operator: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  const validOperators = ["gte", "gt", "lte", "lt"];
  if (!operator || !validOperators.includes(operator)) {
    return { isValid: false, error: "Select a valid guard operator." };
  }
  return { isValid: true };
}

export function validateStepGuard(
  step: { guard: AmountGuard | null; guardAmountInput?: string },
  index: number,
  totalSteps: number,
): StepGuardValidation {
  const isTerminal = index === totalSteps - 1;

  if (isTerminal) {
    if (step.guard !== null) {
      return {
        isValid: false,
        terminalError: "The terminal step of a flow cannot be guarded.",
      };
    }
    return { isValid: true };
  }

  if (step.guard === null) {
    return { isValid: true };
  }

  const opRes = validateGuardOperator(step.guard.operator);
  const rawInput =
    step.guardAmountInput !== undefined
      ? step.guardAmountInput
      : step.guard.amountMinor > 0
        ? minorToRupees(step.guard.amountMinor)
        : "0";
  const amtRes = validateGuardAmount(rawInput);

  return {
    isValid: opRes.isValid && amtRes.isValid,
    operatorError: opRes.error,
    amountError: amtRes.error,
  };
}

// The route a claim of the given total takes through the steps: a guarded
// step either runs or is auto-skipped, and the terminal step is never
// auto-skipped (the runtime never skips it either). Steps without a guard
// always run.
export function simulateRoute(
  steps: Array<{ guard?: AmountGuard | null }>,
  totalMinor: number,
): SimulatedStep[] {
  return steps.map((step, index) => {
    const guard = step.guard ?? null;
    const isTerminal = index === steps.length - 1;
    if (!guard || isTerminal || guardSatisfied(guard, totalMinor)) {
      return { index, guard, runs: true };
    }
    return {
      index,
      guard,
      runs: false,
      reason: `Total ${formatGuardAmount(totalMinor)} ${GUARD_FAIL_PHRASES[guard.operator]} ${formatGuardAmount(guard.amountMinor)} guard`,
    };
  });
}
