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

- What: payments queue export feature - Excel export of the queue (popover chooser: current view vs full queue, client-side SheetJS, shared column schema driving both table and export), server-side PDF expense summary (pdf-lib, all statuses in the drawer + queue side panel, receipt attached), and rejected claims joining the payment queue with the rejection reason surfaced read-only in comments (ADRs 0008-0011).
- Plan: `docs/specs/payment-queue-export-and-pdf-summary.md` (ADRs 0008-0011, CONTEXT.md updated); tracked as issue #46.
- Next: review done (review-maxxing, standards + spec) - all findings fixed; 653 vitest tests passing (36 files), lint/build green. Ready to commit.

