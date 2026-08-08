# 02 - Finance Verification Pool Authorization Fix

**What to build:**
Refactor `verifyClaim` and `markPaid` authorization from strict single `currentActorId` checking to pool-based authorization (`isEligible` check for Finance Executive / Reviewer role), ensuring claims submitted by Finance Head (`EXP-2026-738A63A8` pattern) or assigned to any Finance Executive can be verified and paid by any active Finance Reviewer in the organization.

**Blocked by:** 01 - Core Domain & DB Schema Cleanup - Remove Bank Details / PayoutDetails

**Status:** complete

- [x] Update `verifyClaim` and `markPaid` in `src/server/expenses/commands.ts` to use pool authorization (`isEligible` check for the claim's terminal stage target) instead of strict `claim.currentActorId === actorId`.
- [x] Fix `requireAssignedClaim` usage or replace with pool check helper for finance terminal verification and payment marking.
- [x] Add unit tests in `src/server/expenses/commands.test.ts` verifying that claims submitted by a Finance Head (`emp-pramod`) can be verified and paid by any active Finance Executive (`emp-finance` or `emp-rishikesh`).
- [x] Ensure all backend vitest tests pass.
- [x] Tests written and passing for this slice.
