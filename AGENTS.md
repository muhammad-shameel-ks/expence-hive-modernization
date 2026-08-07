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

- What: fixed review-maxxing findings on PR #45 - `basePageSizeRef` is now actually populated so fit-on-open container resize re-evaluation works (was dead code despite being claimed fixed), wheel handler no longer hijacks scroll when already clamped at MIN/MAX scale, deduped the repeated content-size estimate into `resolveContentSize`, and documented why the payment-queue comment-save spinner doesn't use the shared Button `loading` prop (no discrete save trigger).
  Prior work: fixed PDF overlay scrollbars, fit-on-open zoom, and UX polish via slices in `.scratch/pdf-scrollbar-fixes/slices/`, `.scratch/ux-bugfixes/slices/`, `.scratch/pdf-preview-zoom-layout/slices/`.
- Plan: executed via slices in `.scratch/review-fixes/slices/`.
- Next: review - lint/build green; 508 vitest unit tests passing across 29 test files.

