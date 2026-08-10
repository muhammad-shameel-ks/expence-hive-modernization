# 04 - Flow editor: guard fields + amount-aware simulator

**What to build:** The Superadmin configures guards in the flow editor: each step node gets an operator select and amount input (rupees, paise precision), server validation errors are surfaced, and "Simulate Path" takes a representative amount and shows which steps run and which auto-skip with the guard reason. Everything is keyboard and screen-reader operable.

**Blocked by:** 01 (guard shape on flow steps).

**Status:** ready-for-agent

- [ ] `src/features/admin/flow-section.tsx` step nodes gain guard controls: an operator select (at least / greater than / at most / less than) and an amount input in rupees with paise precision. Both editable by keyboard, with accessible labels tied to the step (follow the file's existing id/label conventions, e.g. `canvas-...` ids).
- [ ] Guard values round-trip through save: the editor's steps state carries the guard, and save/create/publish payloads include it (the admin API already accepts `FlowInput` steps; the shape extension from slice 01 flows through).
- [ ] Server validation errors from the admin API are surfaced in the editor near the relevant control (follow the file's existing error-message pattern).
- [ ] "Simulate Path" (`runSimulation` in flow-section.tsx, currently a decorative animation) gains an amount input; the simulated route marks each guarded step as run or auto-skipped with its guard reason (e.g. "Runs only when total ≥ ₹5000"), and terminal-step guards are impossible since slice 01 validation rejects them.
- [ ] If the simulation route computation is extracted as a pure function for testability, put it where the file's other pure helpers live (e.g. alongside `stepFromInput`/`stepLabel`) - test it there; otherwise test the observable behavior of the guard form state handling.
- [ ] Tests written and passing for this slice (a slice is not done without them). Follow existing conventions: there are no component tests for flow-section; test the pure guard/simulation logic and the admin API round-trip (see `src/server/admin/http.test.ts` / `commands.test.ts` for API-level coverage if you add guard payloads there).

**Files to touch:** `src/features/admin/flow-section.tsx`, and wherever pure guard/simulation helpers land, plus matching test files.

**Verification:** `npm run lint`, `npm run build`, and the vitest suites for the files you touched.
