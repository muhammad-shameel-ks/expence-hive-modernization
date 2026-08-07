# ADR-0007: Persistent Receipt Preview Surface in the Creation Wizard

Status: accepted.

## Context

The `/expenses/new` wizard (receipt-first flow) has three steps - Receipt, Details, Review - plus a CaptureRail side panel that mirrors the steps. Receipts are optional (skip path) and can be a locally picked file or a stored receipt on a resumed draft. Today the wizard shows only a file-name pill for a fresh pick and a conditional "Preview" toggle for stored receipts, so the employee cannot verify the proof they are submitting.

A UX regression compounds this: on the Review step the submit button sits below the fold once forms are filled, and a preview panel would push it further down.

## Decision

Make the receipt preview a persistent surface for the whole wizard, built on `ReceiptPreview` (ADR-0006):

1. Desktop: the CaptureRail becomes a two-part column - the existing step indicator on top, the embedded `ReceiptPreview` below it in a light card inside the dark rail.
2. The surface materializes only when a file is picked or a stored receipt exists; without one, the rail renders as today and the layout does not reserve space.
3. Mobile (under the existing 820px breakpoint where the rail stacks below the form): no embedding - a "View receipt" button opens the full viewer in a full-screen sheet, following the payment queue's mobile overlay pattern. This keeps the form actions above the fold.
4. The Step-1 "Preview" toggle for stored receipts is removed; the file-name pill stays as confirmation of what was picked.
5. Review step: on entry, if the submit button is below the viewport, auto-scroll it into view (non-intrusive `scrollIntoView`-style behavior, guarded against browser focus behavior).

## Consequences

The employee sees the proof beside the decision at every step, satisfying the UX-research requirement that evidence sits beside the decision. One viewer, two mount modes (embedded and sheet) keeps chrome consistent. The dark rail hosts a light viewing surface, so the viewer card needs its own light background treatment. The auto-scroll keeps Review submit reachable despite the taller layout.

## Revisit When

The CaptureRail is redesigned or replaced; or if the wizard grows a capture-first path (camera/gallery per UX spec), the surface may need to accept image sources, which the PDF-only policy (ADR-0004) currently forbids.
