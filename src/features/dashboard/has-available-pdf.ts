/**
 * The first attachment name that looks like a PDF (case-insensitive),
 * or undefined when none does.
 */
export function firstPdfAttachment(attachments: string[]): string | undefined {
  return attachments.find((name) => name.toLowerCase().endsWith(".pdf"));
}

/**
 * Whether the receipt bytes may exist for the expense.
 * False only when the backend explicitly reported them missing.
 */
export function hasAvailableAttachment(attachmentAvailable?: boolean): boolean {
  return attachmentAvailable !== false;
}

/**
 * Whether the expense detail drawer can auto-mount a receipt pane.
 * True only when the receipt bytes exist (attachmentAvailable !== false)
 * and at least one attachment name is a PDF (case-insensitive).
 */
export function hasAvailablePdf(attachments: string[], attachmentAvailable?: boolean): boolean {
  return hasAvailableAttachment(attachmentAvailable) && Boolean(firstPdfAttachment(attachments));
}
