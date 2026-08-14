# 06 - Payment register export

**What to build:** From the verified-only payment queue, finance cherry-picks claims and exports a new "payment register" Excel file - distinct from the existing queue exports (ADR-0010) - containing employee, amount, bank details (holder name, account number, IFSC, bank name, branch, read from the employee's approved bank details from slice 04), and the internal expense ID that anchors the later round-trip import (slice 08).

**Blocked by:** 04 - Profiles page and bank details (the register carries bank details; approved bank details must exist as a read model).

**Status:** ready-for-agent

References: ADR-0023 (docs/architecture/decisions/0023-payment-register-round-trip.md), ADR-0010 (existing queue export - keep it untouched), spec docs/specs/payment-register-profiles-ocr-hold-removal.md (stories 3, 4, 9, 11), CONTEXT.md (Payment register).

## What to change

- Reuse the existing selection model (`src/features/finance/payment-queue-selection.ts`) - the queue already supports multi-select.
- A new export path in the payment-queue export area (e.g. alongside `payment-queue-export.ts`): "payment register" export produces an Excel workbook with one row per selected verified claim: expense ID (internal), employee name, amount, bank holder name, account number, IFSC, bank name, branch. Claims without approved bank details are excluded from the register with a clear report (they cannot be paid until details are approved).
- The register's column header must be stable - slice 08's importer matches on the expense ID column (and detects a file that is not a register export).
- UI: an export control on the queue that is enabled only with a non-empty selection, keyboard accessible, with feedback when some selected claims are excluded for missing bank details.
- Authorization: export requires the finance verify/pay privilege (the queue is already finance-only).

## Acceptance criteria

- [ ] Selecting verified claims and exporting produces a register Excel with the agreed columns including the internal expense ID and bank details.
- [ ] Selected claims without approved bank details are excluded from the file with a clear report.
- [ ] The existing queue exports (current view / full queue) are unchanged.
- [ ] The register can be parsed back by the format defined here (slice 08 imports it).
- [ ] Tests written and passing for this slice (a slice is not done without them).

## Testing

- Export tests: workbook content per selection, bank details present, missing-bank-details exclusion report, header stability (extend the existing `payment-queue-export.test.ts` patterns; `xlsx` is already a dependency).
- UI tests: export control enabled/disabled with selection, feedback message.
- Run `npx vitest run` (full suite), `npm run lint`, `npm run build` - all green.
- Repo conventions: no em dash characters, follow existing patterns.
