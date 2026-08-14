# ExpenseHive Next Agent Guide

- This is the greenfield ExpenseHive replacement; the legacy `../expensehive` directory is read-only and must not be edited.
- Use npm and keep `package-lock.json` synchronized; the available checks are `npm run lint`, `npx vitest run`, and `npm run build`.
- Run the development server with `npm run dev`.
- The application uses Next.js 16.2.12 App Router with TypeScript; application entrypoints are under `src/app` and `@/*` maps to `src/*`.
- Before using unfamiliar Next.js APIs, read the matching guide under `node_modules/next/dist/docs/`; this version may differ from training examples.
- Read `docs/specs/expensehive-modernization.md` before implementing domain behavior and `docs/ux/ux-research.md` before changing UI or UX.
- Feature work and code review must follow the ADRs under `docs/architecture/decisions/` (current set 0015-0021) and their spec `docs/specs/approval-revamp-hold-delegation-dashboard.md`: implementation and reviews check both spec coverage and ADR conformance, and any behavior deviation is either refused or documented as an ADR amendment first.
- Business mutations must stay server-side behind authorization and transaction boundaries; do not put workflow authority in client components.
- UX is a first-class requirement: progressive forms, autosave, clear next actions, actionable approval inboxes, responsive layouts, and WCAG 2.2 AA behavior are specified requirements.
- No database, authentication, storage, email, realtime, or provider adapter is implemented yet; do not assume those services exist.

## Current Work

- What: full ADR compliance/connectivity audit (ADRs 0015-0029) plus fixes for findings surfaced by the audit and an automated PR review on #63: bulk-approve no longer silently pays in-finance claims (restricted to in-approval status per ADR-0029), the `paid` history event now records the bank account used (ADR-0024), the approval-comment length limit is a single shared constant (200) enforced client and server, the admin capability-count error message derives from the six-key catalog instead of a stale "five", and the duplicated selection-set helpers between the approvals inbox and payment queue were consolidated into `src/lib/claim-selection.ts`. Also fixed an unrelated flaky test in `expense-create-form.test.tsx` (an assertion that didn't wait for an async remount).
- Audit notes: no missing ADR/doc cross-references and no orphaned domain modules were found. `docs/specs/approval-revamp-hold-delegation-dashboard.md` is stale (still documents the Hold feature removed by ADR-0026) and should eventually get a superseded-by note.
- Next: 1285 vitest tests passing (68 files), lint and build green.


