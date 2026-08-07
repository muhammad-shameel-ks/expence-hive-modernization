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

- What: fixed claim verification authorization for claims submitted by Finance Head (`EXP-2026-738A63A8`), removed bank details (`payoutDetails`, account number, IFSC code) across DB, domain ports, forms, and table UI, and added in-drawer post-verification prompt banner ("Mark payment as completed now?") with "Yes, Mark Paid" and "Keep Verified" options.
- Also: fixed review-maxxing findings via slices 05-06 in `.scratch/expense-hive-fixes/slices/` - renamed stale `maskPayoutDetails`/`canSeePayoutDetails` to `maskClaimComments`/`canSeeClaimComments`, removed unused `index` from `requireTerminalPoolClaim`, fixed stale "eight text fields" comments and "payout details" copy, deleted client-side `buildVerifiedExpense`/`buildPaidExpense` in favor of server-authoritative `resolveUpdatedExpense`, hidden footer action while the post-verify prompt shows, added refresh-on-close-without-choice sync, and focus restore to the close button on prompt dismissal.
- Plan: executed via slices in `.scratch/expense-hive-fixes/slices/`.
- Next: review - lint/build green; 512 vitest unit tests passing across 30 test files.


