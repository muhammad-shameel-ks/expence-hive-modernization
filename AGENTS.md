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

- What: approval workflow revamp - per-role privilege toggles with mid-flight removal confirmation, hold state on claims, delegation replacing takeover, role-adaptive dashboard with period switch, and the unified one-per-status filter section (ADRs 0015-0021).
- Plan: `docs/specs/approval-revamp-hold-delegation-dashboard.md` (ADRs 0015-0021); tracked as PR #58, issues #51, #54-57.
- Next: opencode reviews on PR #58 addressed (canSubmit enforcement, held-claims Superadmin gate, PDF hold trail, single-user manager lock, delegation eligibility). 1068+ vitest tests passing (52 files), lint/build green. Ready to merge.

