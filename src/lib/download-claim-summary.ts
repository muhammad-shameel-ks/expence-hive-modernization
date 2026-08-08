// Shared flow for downloading a claim's summary PDF: fetch the server route,
// surface a plain error message on failure, and hand the bytes to the blob
// download seam only on success. Both the expense drawer and the payment
// queue panel run the same flow so error copy and handling stay identical.
import { downloadBlob } from "@/lib/download-blob";

/**
 * Downloads the summary PDF for a claim.
 * Returns an error message on failure (server message when present, a
 * fallback otherwise) or null on success; never saves a partial file.
 */
export async function downloadClaimSummary(claimId: string, fileName: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/expenses/${claimId}/summary`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return (
        (body as { message?: string } | null)?.message ??
        "The summary could not be downloaded. Please try again."
      );
    }
    downloadBlob(await response.blob(), fileName);
    return null;
  } catch {
    return "Could not reach the server. Check your connection and try again.";
  }
}
