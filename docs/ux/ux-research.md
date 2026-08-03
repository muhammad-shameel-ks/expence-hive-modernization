# ExpenseHive UX Research

Research date: 2026-08-03.

Status: product input for the modernization specification.

This research focuses on modern enterprise expense and approval experiences.

It treats ease of use as a product behavior and information-architecture goal, not only as a visual styling goal.

## Executive Conclusion

The new application should be a substantial UX replacement rather than a visual port of the Angular application.

The fastest path to an easy experience is to reduce decisions, show only relevant fields, preserve work, explain errors, and make the next action obvious.

The employee experience should be short, progressive, mobile-friendly, and forgiving.

The approver experience should be an exception-focused task inbox with decision evidence beside the decision controls.

The administrator experience should make workflow changes safe through visual editing, simulation, validation, versioning, and publication.

Accessibility, responsive behavior, keyboard support, and status announcements are acceptance criteria rather than post-MVP polish.

## Evidence Themes

### Expense Entry

Nielsen Norman Group recommends logical grouping, short forms, clear labels, explicit requirements, and reduced cognitive load.

Progressive disclosure is appropriate for policy-specific fields, but information needed for the current decision must not be hidden.

Financial submissions need review, confirmation, or another safeguard against accidental commitment.

These findings support a short, single-column default flow with a final review step.

Sources: [NN/g cognitive load](https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/), [NN/g form design](https://www.nngroup.com/articles/web-form-design/), [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/), [WCAG financial error prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html), and [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/).

### Validation and Correction

GOV.UK and WCAG guidance support an error summary linked to field-level messages, preserved input, and actionable correction instructions.

Validation should not interrupt users on every keystroke.

Correction, rejection, cancellation, payment failure, and resubmission should have distinct labels and recovery paths.

Sources: [GOV.UK validation](https://design-system.service.gov.uk/patterns/validation/), [GOV.UK error summary](https://design-system.service.gov.uk/components/error-summary/), [WCAG error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html), and [WCAG error suggestion](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html).

### Receipts

Modern expense products treat receipts as a lifecycle rather than a simple file picker.

Users need visible upload, processing, matching, unmatched, low-confidence, duplicate, rejected, and failed states.

Receipt automation should expose suggestions and confidence while allowing the user to correct every suggested value.

The product should capture first and allow policy-specific enrichment later.

Sources: [Ramp receipt submission](https://support.ramp.com/submitting-receipts-memos-and-accounting-for-your-ramp-transactions), [Brex receipts](https://www.brex.com/support/receipts-for-expenses), and [Expensify expense creation](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Create-an-Expense).

### Approval Work

Established products separate actionable work from waiting and completed records.

Approvers need search, filters, grouping, urgency indicators, and meaningful exception explanations.

The evidence for a decision should be beside the decision, including requester, amount, receipt, policy result, budget context, comments, and approval history.

Automation must expose its rationale and the policy or workflow version that produced it.

Sources: [Ramp transaction review](https://support.ramp.com/reviewing-transactions-from-ramp-cards), [Brex notifications](https://www.brex.com/support/manage-alerts-and-notifications), [Brex flagged expenses](https://www.brex.com/support/flagged-expenses), and [Carbon data tables](https://carbondesignsystem.com/components/data-table/usage/).

### Responsive Design

Mobile should optimize frequent actions rather than reproduce desktop density.

Receipt capture, correction, comments, status, and approval are mobile-friendly actions.

Dense administration and reporting are desktop-oriented, but must still have an accessible responsive representation.

Sources: [Expensify report views](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Using-Reports-in-New-Expensify) and [SAP Concur mobile](https://www.concur.com/products/mobile-app).

### Accessibility

The product should target WCAG 2.2 Level AA.

Relevant behaviors include keyboard access, logical focus order, visible focus, labels, error identification, error suggestions, reflow, contrast, target size, correct control semantics, and status announcements.

At 320 CSS pixels and 400 percent zoom, forms and detail views must reflow without losing information or requiring two-dimensional scrolling.

Sources: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), and [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

### Notifications

In-app tasks and the request history should remain the source of truth.

Email should remind users and deep-link to the exact task.

Required action should not depend on a temporary toast.

Persistent, actionable messages are appropriate for important exceptions.

Sources: [Fluent message bar](https://fluent2.microsoft.design/components/web/react/core/messagebar/usage), [Fluent toast](https://fluent2.microsoft.design/components/web/react/core/toast/usage), and [Carbon notifications](https://carbondesignsystem.com/components/notification/usage/).

## Product UX Principles

1. Capture first and ask for policy-specific detail only when needed.

2. Make the default path short, vertical, and predictable.

3. Prefill known information while clearly labeling suggestions and preserving user overrides.

4. Give every request one visible status, one next action, one blocking reason, and one owner.

5. Prevent errors through constrained choices, clear formats, and policy guidance before submission.

6. Preserve user input across validation, upload failure, server errors, and interrupted sessions.

7. Treat `Needs correction` as recoverable and distinguish it from final rejection.

8. Put decision evidence beside approval controls.

9. Explain policy results, routing, automation, and authority overrides in human language.

10. Use mobile for capture, correction, comments, status, and approval, and desktop for dense administration.

11. Make the approval inbox task-focused rather than a general record archive.

12. Treat accessibility and responsive behavior as product requirements.

13. Make workflow changes safe through preview, validation, versioning, and publication.

14. Use in-app tasks as the canonical source of truth and notifications as reminders.

## UX Requirements

### P0: First Usable Version

- The default expense form requests essential information first and reveals policy-specific fields progressively.
- Every field has a visible label and clear required or optional treatment.
- Drafts autosave and can be resumed after navigation or an interrupted session.
- Submission provides a review-and-confirm step before the request becomes active.
- Failed submission shows a linked error summary and field-level errors without clearing values.
- Error messages explain the problem and the correction required.
- Receipt upload supports web file selection and a mobile camera or gallery path where the device supports it.
- Receipt upload visibly distinguishes uploading, processing, available, failed, and retry states.
- Missing receipts have an explicit exception path rather than forcing users to guess what to do.
- The request detail view shows status, next action, blocking reason, current owner, amount, dates, attachments, policy result, approval chain, and audit history.
- The approver inbox defaults to items requiring action from the current user.
- The inbox separates `Needs my action`, `Waiting`, and `Completed` states.
- The inbox supports search, filters, sorting, urgency indicators, and exception indicators.
- Approve, request changes, reject, takeover, verify, and payment actions are labeled with their consequences.
- `Needs correction`, rejected, paid, skipped, taken over, and adjusted states use distinct labels and explanations.
- The full history is visible to the employee and authorized approvers.
- Notifications deep-link to the exact request and describe the required action.
- Temporary toasts are not the only communication for required action or blocking errors.
- The visual workflow editor provides a route preview and validation feedback before publication.
- Every workflow-editor action has a keyboard and non-drag interaction path.
- The interface targets WCAG 2.2 Level AA.
- The main flows work at 320 CSS pixels, 400 percent zoom, keyboard-only navigation, and screen-reader navigation.

### P1: Near-Term Improvements

- Receipt email forwarding and additional capture channels can be added after the core upload flow is stable.
- OCR and receipt matching can suggest values with visible confidence and manual correction.
- Approval inboxes can add saved views, grouped review, reminders, and approved bulk actions.
- Workflow administration can add rule conflict detection, impact counts, effective dates, comparison, and rollback.
- The product can add richer policy and budget context beside approval decisions.
- The product can add offline capture and queued upload for travel scenarios.

## UX Anti-Patterns

- Do not compress desktop spreadsheet tables into unreadable mobile layouts.

- Do not use placeholder text as the only field label.

- Do not expose every accounting and policy field in the first step.

- Do not hide required instructions in hover-only tooltips.

- Do not validate on every keystroke or clear user input after an error.

- Do not represent every state only through color.

- Do not use one generic action for submit, approve, reject, request changes, and payment.

- Do not mix actionable, waiting, and completed records in one unfiltered inbox.

- Do not use temporary toasts for required actions or payment failures.

- Do not let automation overwrite user-entered values without explanation and recovery.

- Do not publish workflow changes without preview, validation, versioning, and impact visibility.

- Do not make drag-and-drop the only way to configure a workflow.

## Measurement Plan

The first release should instrument task completion rate, time to submit, validation errors, upload failures, correction rate, approval time, mobile completion rate, and abandoned drafts.

Analytics must avoid recording receipt contents, financial secrets, or unnecessary personal data.

UX improvements should be evaluated against task success and correction reduction rather than visual preference alone.
