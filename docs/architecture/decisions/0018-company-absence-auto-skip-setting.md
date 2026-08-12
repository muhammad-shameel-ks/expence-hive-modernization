# ADR-0018: Company-Wise Absence Auto-Skip Setting

Status: accepted.

## Context

`catchUpAbsentStages` in `src/server/expenses/commands.ts` auto-skips a pending stage when its assignee is vacant (no active employee) or has not decided within a hardcoded `ABSENCE_TIMEOUT_MS = 3 days` (`commands.ts:26`).
The skip currently fires only lazily, when the claim is read or acted on, so a claim nobody opens can sit past the timeout indefinitely.
The company wants to control this value per organization without a deployment, and wants the skip to happen even when nobody is looking.

## Decision

1. **The absence timeout becomes an organization-level setting** - a single value per company, configurable in the admin panel (Superadmin only, ADR-0015).
   It replaces the hardcoded 3-day constant and applies to the no-response skip everywhere.
2. **The vacant-stage skip stays immediate and unchanged:** an unassigned or deactivated assignee never waits for the timeout.
3. **A scheduled sweep job enforces the timeout.** A worker (a new container in `compose.yaml`) periodically scans in-flight claims across all organizations, applies the same `catchUpAbsentStages` logic, and persists the resulting skip.
   The lazy catch-up stays as a backstop so the read path behaves identically whether or not the sweep has run.
4. **Held claims are exempt** from the sweep: a hold is an explicit human decision and outranks the timeout (ADR-0016).
5. The skip detail recorded in history names the setting, e.g. "no response within N days", keeping the audit trail truthful about the configured value.

## Consequences

A new org-settings table holds the value (defaulting to the current 3 days for existing organizations).
The worker container needs deployment, scheduling, and idempotent sweep semantics; the lazy path and the sweep share the same `catchUpAbsentStages` implementation so behavior cannot drift.
Admin UI gains a company settings section.

## Revisit When

If companies ask for per-flow or per-stage timeouts, the single-value model grows a default-plus-override shape.
