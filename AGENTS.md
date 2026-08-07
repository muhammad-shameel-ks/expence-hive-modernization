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

- What: fixed PDF overlay scrollbars (direction math, track click jump, ARIA 1.2 non-negative scroll semantics), fit-on-open container size re-evaluation on drawer expansion, wheel zoom state synchronization, and React 19 Button composition via Radix Slottable.
  Prior work: fixed PDF preview pane squeeze and UX polish across timeline, attention list, and drawer actions via slices in `.scratch/pdf-scrollbar-fixes/slices/`.
- Plan: executed via slices in `.scratch/pdf-scrollbar-fixes/slices/`.
- Next: review - lint/build green; 502 vitest unit tests passing across 27 test files.

