import type { ReceiptExtractor } from "./ports";
import {
  MAX_RECEIPT_SIZE_BYTES,
  receiptSizeLimitLabel,
  sniffContentType,
} from "../expenses/receipt-validation";

// The extraction route only carries the receipt file plus a small multipart
// envelope (boundaries and part headers), so the envelope allowance is far
// smaller than the draft-form route's.
const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = 256 * 1024;

// The protected upload handler for receipt suggestions (ADR-0025). The
// route layer authenticates the actor; this layer enforces the format and
// size rules and runs the provider adapter. Suggestions are advisory: the
// response never writes anything to a claim.
export async function handleExtractReceiptRequest(
  request: Request,
  extractor: ReceiptExtractor,
): Promise<Response> {
  try {
    const receipt = await parseReceiptPart(request);
    if (!receipt.ok) return receipt.response;
    try {
      const suggestions = await extractor.extract(receipt.data);
      return Response.json({ suggestions });
    } catch (error) {
      // A provider failure (network, quota, analysis error) must never block
      // the flow: log it and return an empty suggestion set with a message
      // the UI renders as "no suggestions, continue by hand".
      console.error("receipt extraction failed", error instanceof Error ? error : String(error));
      return Response.json({
        suggestions: {},
        message: "We could not read this receipt right now. You can still add the details yourself.",
      });
    }
  } catch (error) {
    console.error("receipt extraction request failed", error instanceof Error ? error : String(error));
    return Response.json(
      { error: "internal", message: "An internal server error occurred." },
      { status: 500 },
    );
  }
}

// Parses the multipart body: exactly one file part named "receipt", checked
// against the server's authoritative rules (size cap, PDF magic bytes).
async function parseReceiptPart(
  request: Request,
): Promise<{ ok: true; data: Uint8Array } | { ok: false; response: Response }> {
  const maxAllowedBytes = MAX_RECEIPT_SIZE_BYTES + MULTIPART_ENVELOPE_ALLOWANCE_BYTES;

  // Reject oversized bodies before formData() buffers them, mirroring the
  // draft-form route: content-length is checked first, chunked bodies are
  // counted byte-by-byte and rebuilt into a fresh request (a consumed body
  // can no longer be parsed as form data).
  const contentLengthHeader = request.headers.get("content-length");
  let parsedRequest = request;
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxAllowedBytes) {
      return { ok: false, response: tooLargeResponse() };
    }
  } else if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxAllowedBytes) {
            await reader.cancel();
            return { ok: false, response: tooLargeResponse() };
          }
          chunks.push(value);
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Lock might already be released on cancel.
      }
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    parsedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: combined,
    });
  }

  let form: FormData;
  try {
    form = await parsedRequest.formData();
  } catch {
    return { ok: false, response: validationResponse() };
  }
  const file = form.get("receipt");
  if (!(file instanceof File)) {
    return { ok: false, response: validationResponse() };
  }
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.byteLength > MAX_RECEIPT_SIZE_BYTES) {
    return { ok: false, response: tooLargeResponse() };
  }
  // The server is authoritative on format: magic bytes, never the declared
  // content type. Only PDF is an accepted receipt format (ADR-0004).
  if (sniffContentType(data) !== "application/pdf") {
    return { ok: false, response: notPdfResponse() };
  }
  return { ok: true, data };
}

function validationResponse(): Response {
  return Response.json({ error: "validation" }, { status: 422 });
}

function notPdfResponse(): Response {
  return Response.json(
    { error: "validation", message: "Receipts must be a PDF file." },
    { status: 422 },
  );
}

function tooLargeResponse(): Response {
  return Response.json(
    {
      error: "too-large",
      message: "The receipt is larger than " + receiptSizeLimitLabel() + ".",
    },
    { status: 413 },
  );
}
