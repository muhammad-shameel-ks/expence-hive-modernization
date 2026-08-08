# 02 - Shared column schema refactor

**What to build:** A single column-schema module becomes the source of truth for the queue table's columns. The table (today hardcoded in `payment-queue-table.tsx`) renders its headers and cells from this schema, and the Excel export (slice 04) will consume the same schema. No visible behavior changes - this is a pure refactor plus the schema module. Per ADR-0010.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [ ] A schema module (e.g. `src/features/finance/payment-queue-columns.ts`) defines the queue's columns: Name, Reference, Category, Sub category, Bill submission, Bill invoice date, Amount, Status, Payment status, Approved on, Remark, Comments - with the renderer data each column needs
- [ ] `payment-queue-table.tsx` renders its `<thead>` and row cells from the schema - the rendered output (headers, ordering, cell content) is identical to today
- [ ] Responsive visibility is preserved: the current `hidden md:table-cell`-style classes stay attached to the right columns
- [ ] Sortable columns (Reference, Category, Bill submission, Amount, Status) keep their sort toggle behavior through the schema
- [ ] `payment-queue-table.test.tsx` still passes, plus new tests asserting the schema drives the rendered headers (headers match schema labels in order)
- [ ] Existing tests pass (`npm test`), lint and build green

**Tests written and passing for this slice:** yes - look at the existing header assertions in `src/features/finance/payment-queue-table.test.tsx` for the pattern.
