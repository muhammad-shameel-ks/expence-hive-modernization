# ADR-0008: Rejected Claims Join the Payment Queue

Status: accepted.

## Context

`listFinancePaymentQueue` returns only claims with status `in-finance` or `paid`.
Rejected claims are terminal and frozen (commenting is blocked), and today they are invisible to Finance in the queue - they only surface in the activity feed.
The Finance head expects rejected claims to appear in the payment queue so the queue shows the full lifecycle record, and so the Excel export covers them.

## Decision

Include `rejected` claims in the payment queue:

1. `listFinancePaymentQueue` filters `in-finance | paid | rejected`.
2. The queue's status filter chips gain a "Rejected" chip with a live count; `paymentStatusFor` maps rejected claims to "Rejected".
3. Rejected rows render as frozen: no verify/pay terminal action and no comment editor.
4. The rejection reason is visible read-only in the Comments column (see ADR-0009).

## Consequences

Finance sees the complete payment record without digging into the activity feed.
The "All" chip count grows to include rejected claims.
The queue's status semantics broaden from "payment workflow" to "payment lifecycle record"; exports cover rejected claims too.
Rejected claims remain terminal - the expansion is purely visibility, not re-openability.

## Revisit When

If rejection becomes revocable or resubmittable, the queue semantics for rejected claims need reconsidering.
