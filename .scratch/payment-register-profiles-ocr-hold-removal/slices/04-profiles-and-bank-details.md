# 04 - Profiles page and bank details

**What to build:** A profiles page where an employee sees identity (name, email, role, department, manager), edits personal fields, and manages bank details (holder name, account number, IFSC, bank name, branch). A bank-details change enters a pending state and takes effect only after a role carrying the new `approve bank detail changes` privilege approves it; nobody approves their own change. Expense submission is blocked server-side until an approved bank detail record exists; drafts remain free. Payments will read the currently-approved bank details (slice 06 consumes them).

**Blocked by:** 01 - Remove the hold feature (the privilege catalog edit and the command boundary must land first).

**Status:** ready-for-agent

References: ADR-0024 (docs/architecture/decisions/0024-profiles-page-and-bank-details.md), spec docs/specs/payment-register-profiles-ocr-hold-removal.md (work item 4, stories 23-34), CONTEXT.md (Bank details).

## What to change

- Domain: a bank-detail change request concept (employee, requested bank details, status pending/approved/rejected, requester, reviewer, timestamps, history). Active bank details = the last approved request for the employee. No bank snapshot on claims in this slice.
- Commands (in `src/server/expenses/commands.ts` or a sibling module): submit bank-detail change, approve change, reject change; a read for active bank details and pending requests. Approval requires the new privilege and must reject self-approval. Format validation on save: account number and IFSC format checks (IFSC: 11 chars, 4 letters + 7 alphanumerics).
- Authorization: `src/server/shared/authorization.ts` gains the `approveBankDetails` capability; the role editor (`src/features/admin/...` role toggles) exposes the new toggle. The catalog is now exactly six toggles: submit claims, approve/reject, finance verify/pay, approve bank detail changes, view org-wide activity, access the admin console.
- Submission gate: the submit-claim command refuses claims from employees without an approved bank detail record, with a clear error pointing at the profiles page. Draft creation is unaffected.
- Profiles page: new route (e.g. `/profile`), identity display (read-only role/department/manager), editable personal fields (e.g. phone), bank details form with validation, change-request history, and pending-state display.
- Finance approval surface: where the approving role reviews pending bank-detail change requests with the requested and current details side by side (approve/reject actions), keyboard accessible.
- Storage: new forward-only SQL migration (e.g. `db/migrations/0031_bank_details.sql`) for the employee personal fields and the bank-detail change request table; update `postgres.ts`, `in-memory.ts`, ports, and seed data. The register export needs this data read-model-ready.
- Navigation: profile link reachable from the app header or menu for every role.

## Acceptance criteria

- [ ] An employee edits personal fields and submits bank details; the change is pending until an authorized role approves it.
- [ ] A person cannot approve their own bank-detail change; approval requires the `approve bank detail changes` privilege.
- [ ] IFSC/account format validation on save with clear errors.
- [ ] A claim without an approved bank detail record cannot be submitted (server-side); drafts still save.
- [ ] The role editor shows the new toggle and the catalog is exactly six toggles.
- [ ] The finance approval surface lists pending requests with current vs requested details and approve/reject actions.
- [ ] The paid history event records the account used (payments read live approved details - make the read available now, slice 06 uses it).
- [ ] Tests written and passing for this slice (a slice is not done without them).

## Testing

- Command tests: submit/approve/reject change, self-approval block, privilege enforcement, format validation, submission gate (draft vs submit).
- Authorization tests: capability resolution for the new toggle, role editor catalog.
- Component tests: profiles page (edit, validation, history), finance approval surface (approve/reject, side-by-side details, self-approval hidden).
- Migration tests: clean apply on fresh and seeded databases (`npm run db:migrate`, `npm run db:seed`).
- Run `npx vitest run` (full suite), `npm run lint`, `npm run build` - all green.
- Repo conventions: no em dash characters, follow existing patterns.
