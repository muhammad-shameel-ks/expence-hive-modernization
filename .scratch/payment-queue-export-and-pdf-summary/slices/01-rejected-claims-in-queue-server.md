# 01 - Rejected claims join the payment queue (server)

**What to build:** The Finance payment queue server-side now returns rejected claims alongside awaiting-payment and paid claims, so the queue shows the full payment lifecycle record. This is the server half of ADR-0008; the table UI that renders these rows is slice 03.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [x] `listFinancePaymentQueue` in `src/server/expenses/commands.ts` includes claims with status `rejected` (currently `in-finance | paid`)
- [x] `commands.test.ts` covers: a rejected claim appears in the queue; an inactive employee is still rejected with `unauthorized`; non-Finance employees still get `unauthorized`
- [x] `http.test.ts` covers: the finance-queue endpoint serves a rejected claim to Finance; an employee is still denied
- [x] Existing tests still pass (`npm test`), lint and build green (`npm run lint`, `npm run build`)

**Tests written and passing for this slice:** yes (extend `src/server/expenses/commands.test.ts` and `src/server/expenses/http.test.ts`; look at the existing `listFinancePaymentQueue` tests around commands.test.ts:885 and http.test.ts:481 for the pattern).
