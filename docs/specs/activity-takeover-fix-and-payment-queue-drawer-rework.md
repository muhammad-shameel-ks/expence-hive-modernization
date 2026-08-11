# Activity Takeover Fix and Payment Queue Drawer Rework

## Problem Statement

On the Organization Activity screen, a Finance Head opening an in-approval claim (e.g. one stuck at a Manager step) has no way to take over and bypass the intervening approver, even though the flow hierarchy allows it.
This is not a missing capability - takeover already works correctly from the dashboard - it simply does not appear on this one screen.

Separately, the payment queue's PDF/receipt panel currently also renders the full approval journey timeline, a capability added in a recent commit.
This conflates two different jobs (viewing a receipt vs. reviewing a claim's journey) in one panel, and duplicates timeline rendering that already exists in the dashboard's expense drawer.
The user wants the receipt panel to go back to being PDF-only, and wants row clicks in the payment queue to open the same expense drawer used elsewhere in the app, so the timeline and its actions (takeover, verify/pay, download summary) live in one place instead of being re-implemented per screen.

## Solution

1. Thread the viewer's role id and role code through to the expense drawer on the Organization Activity screen, the same way the dashboard already does, so `canTakeOver` receives real values instead of `undefined` and the takeover action renders correctly.
2. Revert the payment queue's inline/left receipt panel to its pre-timeline shape: receipt PDF (or a "no receipt attached" fallback) only, with the table shrinking beside it when the panel is open. Give this panel its own trigger, independent of clicking the row.
3. Wire the payment queue table's row click to open the existing expense drawer (the shared right-side drawer already used on the dashboard), passing it the claim and the viewer's identity/role, so takeover, verify/pay, download-summary, and the journey timeline are available from the queue without re-implementing them.

## User Stories

1. As a Finance Head, I want to see a takeover action on an in-approval claim stuck at a Manager step, so that I can bypass the manager and advance the claim myself.
2. As a Finance Head, I want the takeover action to also appear on the Organization Activity screen (not just the dashboard), so that I don't have to navigate elsewhere to act on a claim I'm reviewing there.
3. As an approver whose role matches a later pending step on a claim, I want to see a takeover action for that claim, so that I can jump ahead to my step without waiting on intervening approvers.
4. As a claim's requester, I want to never see a takeover action on my own claim, so that I cannot bypass my own approval chain.
5. As any user, I want the takeover action to never appear on a claim that is not in-approval/submitted (e.g. draft, paid, rejected), so that the action only shows when it's meaningful.
6. As a Finance user working the payment queue, I want to open a claim's receipt PDF without leaving the table, so that I can quickly check the proof of expense.
7. As a Finance user working the payment queue, I want the receipt panel to show only the receipt (not the full journey), so that the panel stays focused and uncluttered.
8. As a Finance user working the payment queue, I want to click a row to open the full expense drawer (timeline, facts, actions), so that I get the same rich claim view I'd get from the dashboard.
9. As a Finance user, I want to open the receipt panel and the expense drawer independently, so that opening one does not force-close or force-open the other.
10. As a Finance user, I want to take over, verify, pay, or download a claim summary from the expense drawer opened from the payment queue, so that I don't need a separate, queue-specific version of those actions.
11. As a developer maintaining the app, I want only one component that renders the journey timeline and its actions, so that a future change to takeover/verify/pay/download logic doesn't need to be duplicated across screens.

## Implementation Decisions

- **Organization Activity takeover fix**: `OrganizationActivityPage` already resolves `workspace.employee.role` (an object with `id` and `code`). Pass `workspace.employee.role?.id` and `workspace.employee.role?.code` through `OrganizationActivity` into the expense drawer it renders, mirroring the props the dashboard already passes. No change to `canTakeOver` or `takeOverClaim` themselves - the bypass logic is correct as-is.
- Scope of the takeover fix is limited to the Organization Activity screen. Other call sites of the expense drawer are not being audited in this pass.
- **Payment queue receipt panel**: revert the panel's JSX to its shape immediately prior to the commit that added the journey timeline into it (`de45cd4`), i.e. drop the `JourneyFlow` render and the `claimToExpense` conversion added for it, keeping `ReceiptPreview` / the no-receipt fallback and the table-shrink layout behavior. This is a surgical revert of one panel's markup, not a revert of that commit's other changes (amount guards, auto-skip policy, migrations), which are unrelated and stay.
- Add a distinct trigger for opening the receipt panel per row (e.g. a receipt/eye icon), separate from the row's click target.
- **Row click behavior**: clicking a payment queue row opens the existing shared expense drawer component (the one already used by the dashboard), passing it the claim (converted the same way the dashboard does), the viewer's id, role id, and role code, and a `currentUser` display name - the payment queue table does not currently receive a display name prop and will need one added to its own props/call chain.
- The expense drawer and the receipt panel maintain independent open/close state in the payment queue table component; neither opening nor closing one affects the other.
- No new shared "drawer shell" component is introduced. The existing expense drawer becomes the single reused component at two call sites (dashboard, payment queue); de-duplication comes from reuse, not a new abstraction layer.

## Testing Decisions

- Unit-test the Organization Activity page/component wiring to confirm role id and role code reach the expense drawer's takeover check (mirroring existing tests for `canTakeOver`/`next-action.ts`, which already cover apex bypass, positional bypass, self-requester exclusion, and non-in-approval statuses - those stay as-is since the bypass logic is unchanged).
- Test that the payment queue's receipt panel renders no journey/timeline content, only the receipt or the no-receipt fallback.
- Test that clicking a payment queue row opens the expense drawer with the correct claim, and that the receipt panel's trigger opens the receipt panel without opening the drawer, and vice versa.
- Test that the expense drawer's existing takeover/verify/pay/download-summary behavior functions correctly when opened from the payment queue (same assertions as its dashboard tests, exercised from the new call site).

## Out of Scope

- Auditing or fixing other screens that render the expense drawer for the same missing-role-props bug (explicitly deferred by the user).
- Any change to the takeover authorization logic itself (`canTakeOver`, `takeOverClaim`) - it is already correct.
- A managed catalog for takeover reason codes (tracked separately as issue #29).
- Any new shared "drawer shell" abstraction beneath the expense drawer.
- Changes to the payment queue's inline comment editing (per-row, in the table columns) - unrelated to the panel/drawer rework.

## Further Notes

- Verified against the real dev Postgres container (`expence-hive-modernization-postgres-1`, db `expensehive`): claim `EXP-2026-A6B621EC` (`claim-94f7d5a6-...`) has steps `manager` (pending, `emp-sanil`) -> `finance-head` (pending, `emp-pramod`) -> `finance-executive` (pending, `emp-finance`), confirming the apex-bypass scenario this fix addresses.
- See ADR-0014 for the reasoning behind reusing the expense drawer rather than building a new shared component.
- Relevant glossary terms (`Takeover`, `Apex bypass`, `Positional bypass`, `Expense drawer`, `Receipt panel`) were added to `CONTEXT.md` during planning.
