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

- What: fixed the PDF preview pane squeeze - zooming a receipt past ~75% in the two-pane expense drawer no longer grows the receipt pane and pushes the details column (added `lg:min-w-0` to both panes in expense-drawer.tsx). Prior work: three UX bugfixes - timeline blinks the next pending step (not current), "Need your attention" shows only in-flight claims assigned to me, and loading states on all drawer action buttons (shared Button `loading` prop), all via slices in `.scratch/ux-bugfixes/slices/`.
- Plan: in conversation only (plan-maxxing, not saved); slice at `.scratch/pdf-preview-zoom-layout/slices/01-pane-squeeze-fix.md`
- Next: review - lint/build green; fix verified in Playwright at 100%/125% zoom (panes hold 486/486, canvas clips and pans inside the viewer); changes are uncommitted across timeline.tsx, expense-drawer.tsx, dashboard-attention.ts, expense-overview.tsx, next-action.ts, dashboard.tsx, button.tsx, people-section.tsx.
