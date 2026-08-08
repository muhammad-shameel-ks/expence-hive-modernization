# ADR-0010: Payments Queue Excel Export with a Shared Column Schema

Status: accepted.

## Context

The Finance head wants to export the payment queue to Excel to work with the data externally.
The queue table is client-side filtered (search, status/category/amount/date filters) and sorted, and its columns are hardcoded in the table component.
The export must follow future column changes automatically, and the user asked for a choice between the filtered view and the full queue.

## Decision

1. One "Export" button opens a popover with two actions: "Export current view" (respects search, filters, and sort) and "Export full queue" (ignores them).
2. The `.xlsx` is generated client-side with SheetJS from the claims the page already holds; the filter/sort logic is not duplicated server-side.
3. A shared column schema module becomes the single source of truth for both the table's rendered columns and the Excel columns; future column changes flow to the export automatically.
4. "Export current view" is disabled when the filtered view is empty.

## Consequences

Column definition lives in one place; the table refactors from hardcoded columns to schema-driven rendering.
No filter logic duplication and no new server route for the Excel path.
The Excel file always contains every schema column regardless of the table's responsive column hiding.
A client-side dependency is added (SheetJS), and the npm registry package is stale - the maintained distribution must come from the SheetJS CDN, with exceljs server-side as fallback.

## Revisit When

If exports must ever reflect server-authoritative data, or the queue grows beyond client-scale rows, generation should move server-side.
