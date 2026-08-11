# 05 - Inline accessible guard validation (story 22)

**What to build:** Guard operator/amount fields in the flow editor validate on the client with inline error messages wired via `aria-invalid` + `aria-describedby`, so a screen-reader user knows immediately (not only after a server round-trip) when a condition is invalid.

**Blocked by:** 01 - Shared amount-guard module (S1 moves the guard helpers `flow-section.tsx` imports and may rename imports in this file; also S6 touches flow-section.tsx - coordinate file ownership).

**Status:** ready-for-agent

## Context

Spec story 22: "As a screen-reader user, I want the guard fields and their validation errors to have meaningful accessible names, so that the condition is understandable without sight."

Today in `src/features/admin/flow-section.tsx` (~line 600-660):
- Guard fields have `sr-only` labels (good) but NO inline validation.
- Typing an invalid amount: `rupeesToMinor(e.target.value)` returns null → `?? 0` writes 0 into state → the field silently shows "0". An empty operator is also possible client-side.
- Validation errors surface ONLY from the server on save (admin/commands.ts `validateFlowDraft`, ~line 165-175: terminal guard, unknown operator, non-positive amount) and render where server errors go in this component (check `onError`/error display ~line 68, 233).
- Server rules: operator must be one of `gte|gt|lte|lt`; amountMinor positive integer; terminal step must not be guarded.

## What to build

- Client-side validation for the guard fields in `flow-section.tsx`:
  - Amount: invalid when `rupeesToMinor(value)` returns null or the parsed minor is <= 0. Do NOT silently coerce invalid input to 0 (fix the `?? 0` - keep the previous valid value or blank on invalid input, matching how other amount inputs in this app behave - check `minorToRupees`/`rupeesToMinor` usage elsewhere).
  - Operator: invalid when empty/unset (if a "choose" placeholder option exists).
  - Terminal step guard: warn/error inline on the step node (spec: "validation rejects any guard on the terminal step" - the client already disallows or should disallow it; check current behavior and make it consistent with server rejection).
- Inline error rendering: error text with an accessible name - each error `id` referenced by the field's `aria-describedby`, field gets `aria-invalid="true"` while invalid. Errors are visible text (not sr-only) per WCAG 2.2 AA - match the repo's existing error-message styling (e.g. the `role="status"` error bar in payment-queue-table.tsx, or whatever pattern flow-section uses).
- Server-side validation stays authoritative; client validation is a faster, accessible first line. The existing server save error display must remain.
- Publish button: should it be disabled while client-side guard validation fails? Check how other invalid flow states are handled (role fields) and match that behavior.

## Acceptance criteria

- [ ] Typing "abc" / "0" / "-5" in the guard amount shows an inline error, does NOT silently write 0
- [ ] Empty operator shows an inline error
- [ ] Guard on terminal step is rejected client-side with an inline error (or already prevented - verify and make explicit)
- [ ] Fields wire `aria-invalid` + `aria-describedby` to the error text
- [ ] Server validation + its error display unchanged
- [ ] Tests: pure-function tests for any extracted validation helper (e.g. `validateGuard` in flow-guard.ts or the shared module, matching flow-guard.test.ts style). No component-render tests (repo convention).
- [ ] `npm run lint`, `npm run build`, full `npm test` pass

## Environment

- Worktree: /home/shameel/.herdr/worktrees/expence-hive-modernization/feat-conditions
- Test: `npx vitest run src/features/admin/flow-guard.test.ts src/server/admin/commands.test.ts`
- Read `docs/ux/ux-research.md` for WCAG 2.2 AA behavior requirements before changing UI.
- Keyboard usability (story 21) must not regress - fields are already keyboard-reachable; keep focus behavior intact.
