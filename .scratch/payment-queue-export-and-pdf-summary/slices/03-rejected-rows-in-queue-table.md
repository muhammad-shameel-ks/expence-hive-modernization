# 03 - Rejected rows in the queue table

**What to build:** The queue page now surfaces rejected claims as frozen rows: a "Rejected" filter chip with a live count, no verify/pay action and no comment editor on rejected rows, and the rejection reason (actor, timestamp, reason) rendered read-only in the Comments column, sourced from the claim's history - never written into the `comments` field. Per ADR-0008 and ADR-0009.

**Blocked by:** 01 (server returns rejected claims), 02 (table is schema-driven).

**Status:** ready-for-agent

- [ ] A "Rejected" chip joins the status filter chips (`All`, `Awaiting payment`, `Paid`) with a live count; the existing `FILTERS` constant and `countFor` logic grow accordingly
- [ ] `paymentStatusFor` in `payment-queue-query.ts` maps rejected claims to "Rejected" so the status chip, sorting, and filter all work
- [ ] Rejected rows render no verify/pay terminal action button (the existing `viewerCanAct` gate already excludes non-in-finance claims - confirm and cover with a test)
- [ ] Rejected rows render no comment editor; instead the Comments column shows a read-only entry with the latest `rejected` history entry: the reason (history `detail`), actor name, and date
- [ ] The rejection entry must not be editable and must not write into `claim.comments`
- [ ] `payment-queue-table.test.tsx` covers: Rejected chip count, filtering to rejected, "Rejected" status display, no action button on rejected rows, no comment editor, and the read-only rejection reason entry in the Comments column
- [ ] Existing tests pass (`npm test`), lint and build green

**Tests written and passing for this slice:** yes - extend `src/features/finance/payment-queue-table.test.tsx` and `payment-queue-query.test.ts`; fixture claims already cover terminal states (see `src/features/dashboard/mock-data.ts` and the existing queue tests).
