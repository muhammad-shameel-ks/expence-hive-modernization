# ADR-0012: Amount Guards on Workflow Nodes

Status: accepted.

## Context

Organizations need different approval paths for different claim sizes: a ₹50 reimbursement should not alert the Finance Head, but a ₹50,000 one should.
The options considered were: amount conditions per node, separate workflows routed by amount, and sub-flows (a branching engine).
The published-workflow model is already immutable, and the broad spec explicitly keeps arbitrary workflow branching out of scope.
The workflow simulator already takes an amount as input, and the DB spec listed "amount overrun approval" as a pending future slice.

## Decision

1. Amount conditions are modeled as **per-node guards**, not as nested flows or routed workflow definitions.
   A workflow stays a single ordered list of nodes; any node type (approval, notification, Finance verification, payment-completion) can carry an optional guard.
2. A guard is `operator + amount` with operators `>=`, `>`, `<=`, `<`, read as "this node runs only when the claim total satisfies the operator".
3. The guarded amount is the **claim total** (sum of expense lines), computed server-side once at submission; the result is frozen with the claim, consistent with the immutable workflow version captured at submission.
4. A node whose guard fails is **auto-skipped** and the linear flow continues at the next node; the skip is recorded as a distinct history event kind (ADR-0013).
5. Workflow validation blocks configurations that strand claims - e.g. a guarded payment-completion node that some amounts can never reach. Publication refuses unsafe configs.
6. The simulator (already parameterized by amount) shows which nodes would be skipped for a given amount; the node editor exposes the guard fields.
7. This mechanism subsumes the pending "amount overrun approval" slice from the DB spec; that slice is retired.

## Consequences

No branching engine and no duplicated workflow definitions; one linear workflow expresses amount-based policy.
Guards make amount-overrun approval and low-value fast paths expressible as ordinary configuration.
Validation correctness becomes load-bearing: a missed stranding case ships silently to live claims.
The threshold boundary (`>=` vs `>`) is HR's responsibility, mitigated by the simulator's route preview.

## Revisit When

If organizations need conditions on other claim attributes (category, department, requester), generalize the guard predicate while keeping the operator/amount shape.
If parallel or joined approvals are required, that is a separate branching-engine decision, not an extension of guards.
