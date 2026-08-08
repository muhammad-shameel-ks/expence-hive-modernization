# ExpenseHive Next Agent Guide

- This is the greenfield ExpenseHive replacement; the legacy `../expensehive` directory is read-only and must not be edited.
- Use npm and keep `package-lock.json` synchronized; the available checks are `npm run lint` and `npm run build`.
- Run the development server with `npm run dev`; there is no test runner or test script configured yet.
- The application uses Next.js 16.2.12 App Router with TypeScript; application entrypoints are under `src/app` and `@/*` maps to `src/*`.
- Before using unfamiliar Next.js APIs, read the matching guide under `node_modules/next/dist/docs/`; this version may differ from training examples.
- Read `docs/specs/expensehive-modernization.md` before implementing domain behavior and `docs/ux/ux-research.md` before changing UI or UX.
- Business mutations must stay server-side behind authorization and transaction boundaries; do not put workflow authority in client components.
- UX is a first-class requirement: progressive forms, autosave, clear next actions, actionable approval inboxes, responsive layouts, and WCAG 2.2 AA behavior are specified requirements.
- No database, authentication, storage, email, realtime, or provider adapter is implemented yet; do not assume those services exist.

## Current Work

- What: persistent receipt preview surface in the `/expenses/new` wizard - dual-source `ReceiptPreview`, one hoisted viewer across all wizard steps, mobile sheet access on every step, source/focus/mobile hydration polish, and Review-step auto-scroll (ADRs 0006-0007).
- Plan: sliced in `.scratch/wizard-receipt-preview/slices/`; ADRs `docs/architecture/decisions/0006-dual-source-receipt-preview.md` and `0007-persistent-wizard-receipt-preview.md`; CONTEXT.md updated.
- Next: review - lint/build green; 538 vitest tests passing across 31 test files (browser verification completed for the wizard surface).

