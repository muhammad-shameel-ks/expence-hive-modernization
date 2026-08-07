# 01 - Core Domain & DB Schema Cleanup - Remove Bank Details / PayoutDetails

**What to build:**
Completely remove `payoutDetails` (including `accountNumber` and `ifscCode`) from domain models, database schema, migration/seed scripts, HTTP parsers, store implementations, and backend tests.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [ ] Remove `payoutDetails`, `accountNumber`, `ifscCode` from `ExpenseClaim`, `CreateExpenseDraftInput`, `UpdateExpenseDraftInput` interfaces in `src/server/expenses/ports.ts`.
- [ ] Remove `account_number` and `ifsc_code` columns from SQL schema/migrations, `scripts/seed.mjs`, `src/server/expenses/postgres.ts`, and `src/server/expenses/in-memory.ts`.
- [ ] Remove body parsing & validation for `accountNumber` and `ifscCode` in `src/server/expenses/http.ts`.
- [ ] Update backend test suites (`commands.test.ts`, `postgres.test.ts`, `http.test.ts`) so all 508 tests pass.
- [ ] Tests written and passing for this slice.
