# 08 - Register drag-back import and bulk mark paid

**What to build:** Finance drags the payment register Excel (from slice 06) back onto the payments tab. The file is uploaded to a protected server route that parses it server-side (never in the browser), extracts the expense IDs, validates the rows, and returns the matching claims for auto-selection. Finance reviews the auto-selected claims, then bulk-marks them paid: each claim is validated at execution, ineligible rows are skipped and reported, eligible rows are paid (partial success is expected). A keyboard-reachable file input accompanies the drop zone.

**Blocked by:** 06 - Payment register export (the file format is defined there).

**Status:** ready-for-agent

References: ADR-0023 (docs/architecture/decisions/0023-payment-register-round-trip.md), spec docs/specs/payment-register-profiles-ocr-hold-removal.md (stories 5-11), CONTEXT.md (Payment register).

## What to change

- A protected import route (e.g. `POST /api/finance/payment-register/import` or similar) that accepts the uploaded Excel, parses it server-side with `xlsx` (already a dependency), validates that it is a register export (stable header check per slice 06), extracts the expense IDs, and returns the matching claims plus a row-level report (matched, unknown ID, not-verified). Authorization: finance verify/pay privilege.
- Bulk payment command: `markClaimsPaid(actorId, claimIds)` - validates every claim at execution (verified state, not already paid), pays eligible claims with individual `paid` history events (reusing the existing single-claim eligibility logic), and returns a per-claim report of skipped rows. Transactional per claim; partial success is the expected outcome.
- UI on the payments tab: a drop zone with a keyboard-reachable file input; after import, the returned claims are auto-selected in the queue (reuse the existing selection model), with an import report shown (matched count, conflicts). The existing bulk "mark paid" action then runs over the selection with a result report of skipped rows. No claim is paid without an explicit confirmation click.
- The bulk pay action is available for any selection (the register import just makes the selection), so it also serves plain cherry-picked selections.

## Acceptance criteria

- [ ] Dragging a register file onto the payments tab (or choosing it via file input) auto-selects the matching claims after a server-side parse; a report shows matched, unknown, and ineligible rows.
- [ ] A file that is not a register export is rejected with a clear message; parsing happens server-side only.
- [ ] Bulk mark paid pays all eligible selected claims, skips ineligible ones (already paid, no longer verified), and reports both groups; no claim is paid without an explicit confirm.
- [ ] Each paid claim records its own `paid` history event with actor and timestamp; single-claim `markPaid` keeps working.
- [ ] Import and bulk pay require the finance verify/pay privilege.
- [ ] Tests written and passing for this slice (a slice is not done without them).

## Testing

- Command tests: bulk pay partial success (mixed eligible/ineligible), all-eligible, all-ineligible, idempotency (re-running pays nothing new), authorization, per-claim history events (extend `commands.test.ts` patterns).
- Import route tests: valid register, non-register file, unknown IDs, unauthorized access, non-Excel content.
- UI tests: drop zone + file input alternative, auto-selection, import report, bulk-pay confirm and result report (extend `payment-queue-selection.test.ts` / `payment-queue-table.test.tsx` patterns).
- Run `npx vitest run` (full suite), `npm run lint`, `npm run build` - all green.
- Repo conventions: no em dash characters, follow existing patterns.
