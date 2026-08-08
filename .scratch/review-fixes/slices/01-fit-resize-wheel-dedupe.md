# 01 - Fix fit-on-resize dead code, conditional wheel zoom, dedupe content-size estimate

**What to build:** In `src/features/receipts/receipt-preview.tsx`, make the advertised "fit-on-open container resize re-evaluation" actually work, stop the wheel handler from unconditionally hijacking scroll, and remove the duplicated content-size estimate.

This slice fixes findings confirmed by review-maxxing (Standards + Spec axes) on PR #45, which in turn re-confirmed an automated bot review comment on the same PR that was never actually addressed despite a commit message and `.scratch/pdf-scrollbar-fixes/slices/02-fit-on-open-wheel-sync.md` claiming it was fixed.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [ ] `basePageSizeRef.current` is assigned the real base page size. In the fresh-document load branch (~line 213-215), after computing `baseViewport = firstPage.getViewport({ scale: 1 })`, assign `basePageSizeRef.current = { w: baseViewport.width, h: baseViewport.height }`. Confirm the ResizeObserver-driven re-fit branch (~line 321: `if (!hasUserZoomedRef.current && basePageSizeRef.current)`) is now reachable and actually re-fits the scale when the container resizes post-transition (e.g. drawer expands/collapses, window resizes across the lg breakpoint) without the user having manually zoomed.
- [ ] The wheel handler (~line 365-413) only calls `event.preventDefault()` and mutates zoom/pan state when the clamped `newScale` actually differs from `scaleRef.current`. When already at `MIN_SCALE`/`MAX_SCALE` (so `nextScale` returns the same value), the event must NOT be preventDefaulted - let it fall through so the surrounding scrollable container (drawer, form) can scroll normally when the cursor happens to be over the PDF viewer.
- [ ] The three duplicated `estimatedContent = basePageSizeRef.current ? estimateContentSize(...) : { w: ..., h: ... }` ternaries (in the wheel handler, `zoomTo`, and the ResizeObserver effect) are extracted into one shared helper (e.g. `resolveContentSize(measured, newScale)`) and all three call sites use it.
- [ ] Existing behavior is preserved: fit-on-open (first load), manual zoom via toolbar/wheel/keyboard, panning, and the overlay scrollbar math all continue to work exactly as before for cases unaffected by this fix.
- [ ] Vitest tests updated/added to cover: `basePageSizeRef` gets populated on load, the ResizeObserver re-fit branch fires when container size changes and the user hasn't zoomed, and the wheel handler does NOT preventDefault/mutate state when scale is already clamped at a bound.
- [ ] `npm run lint` and full `npm run test` suite pass cleanly.
