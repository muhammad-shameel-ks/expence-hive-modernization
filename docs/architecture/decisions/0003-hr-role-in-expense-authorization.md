# ADR-0003: Add HR as an Explicit Expense Role

Status: accepted.

## Context

The codebase has two role systems that grew independently: `AdminRole` (`src/server/admin/ports.ts`), which already includes `hr-administrator` and governs the admin console and flow builder, and `ExpenseRoleCode` (`src/server/expenses/ports.ts`), which governs claim and payment authorization and only knows about `employee | manager | it-reviewer | ceo | finance-reviewer`.

HR needs access to a new Finance Payment View to verify claims and Payout Details (account number, IFSC code) alongside Finance, but HR has no representation in the role system that authorizes claim and payment access.

## Decision

Add `hr` as a value in `ExpenseRoleCode` and authorize it directly in claim/payment commands, rather than special-casing `AdminRole`'s `hr-administrator` inside the expense module.

## Consequences

`AdminRole` and `ExpenseRoleCode` remain two separate lists; an employee needing both admin-console and claim/payment HR access must be assigned both `hr-administrator` and `hr` today. Whether these should be kept in sync per employee is an open question (see `docs/domain-model/approval-workflow.md`).
