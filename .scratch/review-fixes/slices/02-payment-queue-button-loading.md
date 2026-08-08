# 02 - Align payment-queue comment-save spinner with shared Button loading pattern

**What to build:** In `src/features/finance/payment-queue-table.tsx`, replace the one-off raw `LoaderCircle` spinner inside the comment-save `<input>` flow with the shared `Button` component's `loading` prop mechanism, matching how every other action button in the app surfaces a pending save state.

This fixes a minor spec deviation found by review-maxxing's Spec axis: slice 03 (`.scratch/ux-bugfixes/slices/03-drawer-loading-states.md`) mandates finance payment-queue buttons use the shared `loading` prop, but the comment-save affordance bypassed it with an ad hoc spinner.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [ ] Identify the comment-save action in the payment queue table and locate its trigger control (the actual save action, not the text input itself).
- [ ] If the save is triggered by a button (e.g. an icon button next to the input, or an implicit submit), use the shared `Button` component's `loading` prop instead of manually rendering `LoaderCircle`.
- [ ] If the save has no separate button (pure inline-input autosave with no discrete trigger), leave the current inline spinner as-is and instead add a one-line comment or note explaining why the shared `Button loading` pattern doesn't apply here - do not force an awkward composition onto a plain input.
- [ ] No visual regression: the loading state remains visible and clear during a pending save.
- [ ] Vitest tests updated/added covering the loading state during a comment save.
- [ ] `npm run lint` and full `npm run test` suite pass cleanly.
