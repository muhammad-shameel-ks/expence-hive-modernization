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

- What: bulk expense approvals (ADR-0029) - dedicated approvals inbox table (/expenses/approvals), batch selection with summary total, confirmation modal with optional approval comment, resilient server-side batch approval command with per-claim skip reporting, and active Approvals navigation link.
- Plan: ADR-0029 (`docs/architecture/decisions/0029-bulk-expense-approvals.md`).
- Next: 1283+ vitest tests passing (68 files), lint and build green. Bulk approvals ready for review.


