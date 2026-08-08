import { ExpenseError, isExpenseError, type ExpenseCommands } from "./commands";
import type { CreateExpenseDraftInput, ReceiptUploadInput } from "./ports";
import { MAX_RECEIPT_SIZE_BYTES, receiptSizeLimitLabel } from "./receipt-validation";

// The receipt cap applies to the file's own bytes; the whole multipart body
// additionally carries the envelope (boundaries, part headers, and the six
// text fields). The content-length pre-check allows that much headroom so a
// file exactly at the cap is not falsely rejected.
const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = 1024 * 1024;

// Parses the receipt-first form's multipart body: six text fields plus an
// optional file part named "receipt". Returns null on any malformed part;
// the size cap and content-type authority live in the command layer.
async function parseDraftForm(request: Request): Promise<CreateExpenseDraftInput | null> {
  // Reject oversized bodies before formData() buffers them: the content-length
  // header is checked first. Bodies without a content-length header (chunked
  // transfer encoding) are streamed chunk-by-chunk up to maxAllowedBytes before
  // formData() parses them.
  const maxAllowedBytes = MAX_RECEIPT_SIZE_BYTES + MULTIPART_ENVELOPE_ALLOWANCE_BYTES;
  let parsedRequest = request;

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxAllowedBytes) {
      throw new ExpenseError("too-large", "The form or receipt is larger than " + receiptSizeLimitLabel() + ".");
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
            throw new ExpenseError("too-large", "The form or receipt is larger than " + receiptSizeLimitLabel() + ".");
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

  const form = await parsedRequest.formData();
  const title = form.get("title");
  const category = form.get("category");
  const subCategory = form.get("subCategory");
  const remark = form.get("remark");
  const amount = form.get("amount");
  const expenseDate = form.get("expenseDate");
  if (
    typeof title !== "string" ||
    typeof category !== "string" ||
    typeof subCategory !== "string" ||
    typeof remark !== "string" ||
    typeof amount !== "string" ||
    typeof expenseDate !== "string"
  ) {
    return null;
  }
  const amountMinor = parseAmount(amount);
  if (amountMinor === null) return null;
  const receiptFile = form.get("receipt");
  if (receiptFile !== null && !(receiptFile instanceof File)) return null;
  let attachment: ReceiptUploadInput | undefined;
  if (receiptFile instanceof File) {
    const data = new Uint8Array(await receiptFile.arrayBuffer());
    attachment = { fileName: receiptFile.name, contentType: receiptFile.type, data };
  }
  return {
    title,
    category,
    subCategory,
    remark,
    amountMinor,
    currency: "INR",
    expenseDate,
    attachment,
  };
}

export async function handleCreateExpenseRequest(
  request: Request,
  commands: ExpenseCommands,
  actorId: string,
): Promise<Response> {
  try {
    const input = await parseDraftForm(request);
    if (!input) return validationResponse();
    const claim = await commands.createDraft(actorId, input);
    return Response.json({ claim }, { status: 201 });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleUpdateExpenseRequest(
  request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    const input = await parseDraftForm(request);
    if (!input) return validationResponse();
    const claim = await commands.updateDraft(actorId, claimId, input);
    return Response.json({ claim });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleDeleteExpenseRequest(
  _request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    await commands.deleteDraft(actorId, claimId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleGetReceiptRequest(
  _request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    const receipt = await commands.getReceipt(actorId, claimId);
    // Response bodies require an ArrayBuffer-backed view; the blob bytes are
    // copied into one (the 25 MB cap keeps the copy cheap).
    return new Response(new Uint8Array(receipt.data), {
      headers: {
        "content-type": receipt.contentType,
        "content-length": String(receipt.sizeBytes),
        "content-disposition": `inline; filename="${sanitizeFileName(receipt.fileName)}"`,
        // Receipt bytes are sensitive, authorization-checked data: never let
        // a shared or on-disk cache serve them without a fresh access check.
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleSubmitExpenseRequest(
  _request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    const claim = await commands.submitClaim(actorId, claimId);
    return Response.json({ claim });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleGetExpenseRequest(
  _request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    const [claim, employees] = await Promise.all([
      commands.getClaim(actorId, claimId),
      commands.listEmployees(actorId),
    ]);
    return Response.json({ claim, employees });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleApproveExpenseRequest(
  _request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    return Response.json({ claim: await commands.approveStage(actorId, claimId) });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleRejectExpenseRequest(
  request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).reason !== "string") {
      return validationResponse();
    }
    const reason = (body as Record<string, unknown>).reason as string;
    return Response.json({ claim: await commands.rejectClaim(actorId, claimId, reason) });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleTakeOverExpenseRequest(
  request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).reasonCode !== "string") {
      return validationResponse();
    }
    const reasonCode = (body as Record<string, unknown>).reasonCode as string;
    return Response.json({ claim: await commands.takeOverClaim(actorId, claimId, reasonCode) });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleVerifyExpenseRequest(
  _request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    // The employee list rides along so the drawer can render the stamped
    // claim with real actor names, not "System" placeholders.
    const [claim, employees] = await Promise.all([
      commands.verifyClaim(actorId, claimId),
      commands.listEmployees(actorId),
    ]);
    return Response.json({ claim, employees });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handlePayExpenseRequest(
  _request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    const [claim, employees] = await Promise.all([
      commands.markPaid(actorId, claimId),
      commands.listEmployees(actorId),
    ]);
    return Response.json({ claim, employees });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleFinancePaymentQueueRequest(
  _request: Request,
  commands: ExpenseCommands,
  actorId: string,
): Promise<Response> {
  try {
    const claims = await commands.listFinancePaymentQueue(actorId);
    return Response.json({ claims });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleUpdateCommentsRequest(
  request: Request,
  commands: ExpenseCommands,
  actorId: string,
  claimId: string,
): Promise<Response> {
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).comments !== "string") {
      return validationResponse();
    }
    const claim = await commands.updateComments(actorId, claimId, (body as Record<string, unknown>).comments as string);
    return Response.json({ claim });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

function parseAmount(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [rupees, paise = ""] = value.trim().split(".");
  const minor = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function expenseErrorResponse(error: unknown): Response {
  if (!isExpenseError(error)) {
    console.error("expense command failed", error instanceof Error ? error : String(error));
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const status =
    error.code === "unauthorized"
      ? 403
      : error.code === "not-found"
        ? 404
        : error.code === "conflict"
          ? 409
          : error.code === "too-large"
            ? 413
            : 422;
  return Response.json({ error: error.code, message: error.message }, { status });
}

// The browser-supplied file name lands in a content-disposition header, so
// header-breaking characters are stripped before it is quoted (RFC 6266).
function sanitizeFileName(fileName: string): string {
  const sanitized = fileName.replace(/["\\\r\n]/g, "");
  return sanitized.trim() ? sanitized : "receipt";
}

async function readBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validationResponse(): Response {
  return Response.json({ error: "validation" }, { status: 422 });
}
