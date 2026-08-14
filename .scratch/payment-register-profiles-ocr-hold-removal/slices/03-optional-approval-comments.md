# 03 - Optional approval comments

**What to build:** The approve action gains an optional free-text comment. A provided comment is stored on the `approved` history event (actor + timestamp) and rendered everywhere the rejection reason renders today: journey timeline, expense drawer, activity feed, and expense summary PDF. An approval without a comment remains valid.

**Blocked by:** 01 - Remove the hold feature (shared command boundary and render surfaces; slice 01 must land first).

**Status:** ready-for-agent

References: ADR-0028 (docs/architecture/decisions/0028-optional-approval-comments.md), ADR-0009 (rejection reason pattern - mirror it), spec docs/specs/payment-register-profiles-ocr-hold-removal.md (work item 2, stories 14-17), CONTEXT.md (Approval comment).

## What to change

- Command boundary: `approveStage(actorId, claimId, comment?)` in `src/server/expenses/commands.ts` - comment optional, trimmed, max length bounded (match existing validation style), stored as detail on the `approved` history event. Never written to the claim-level comments field (`updateComments` stays Finance-only as today).
- API: `src/app/api/expenses/[id]/approve/route.ts` + `src/server/expenses/http.ts` accept an optional comment body.
- Render surfaces: journey timeline (`src/features/dashboard/journey-flow.tsx`, `journey-meta.ts`), the expense drawer's decision display (`src/features/dashboard/expense-drawer.tsx`), the activity feed (`src/features/dashboard/my-activity.tsx` and finance organization-activity if it shows approvals), and the expense summary PDF (`src/server/expenses/summary-pdf.ts`).
- The approve control (drawer) gains an optional comment textarea next to the approve action, keyboard accessible, labelled.

## Acceptance criteria

- [ ] An approver can approve with a comment, approve without one, and both succeed.
- [ ] The comment appears in the timeline, drawer, activity feed, and PDF exactly where the rejection reason appears; empty comments render nothing.
- [ ] The comment is on the history event only, never the claim comments field.
- [ ] Server-side trimming and length validation; the route rejects oversized comments.
- [ ] Tests written and passing for this slice (a slice is not done without them).

## Testing

- Command tests: approve with/without comment, trimming, length bound, comment recorded with actor + timestamp.
- HTTP route tests: optional body, validation failure, success.
- Component tests: comment field on the approve action, rendering in timeline/feed, PDF output includes the comment.
- Run `npx vitest run` (full suite), `npm run lint`, `npm run build` - all green.
- Repo conventions: no em dash characters, follow existing patterns.
