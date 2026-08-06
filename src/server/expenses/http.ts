import { isExpenseError, type ExpenseCommands } from "./commands";
import type { ReceiptUploadInput } from "./ports";

export async function handleCreateExpenseRequest(
  request: Request,
  commands: ExpenseCommands,
  actorId: string,
): Promise<Response> {
  try {
    const form = await request.formData();
    const title = form.get("title");
    const category = form.get("category");
    const subCategory = form.get("subCategory");
    const remark = form.get("remark");
    const amount = form.get("amount");
    const expenseDate = form.get("expenseDate");
    const accountNumber = form.get("accountNumber");
    const ifscCode = form.get("ifscCode");
    if (
      typeof title !== "string" ||
      typeof category !== "string" ||
      typeof subCategory !== "string" ||
      typeof remark !== "string" ||
      typeof amount !== "string" ||
      typeof expenseDate !== "string" ||
      typeof accountNumber !== "string" ||
      typeof ifscCode !== "string"
    ) {
      return validationResponse();
    }
    const amountMinor = parseAmount(amount);
    if (amountMinor === null) return validationResponse();
    const receiptFile = form.get("receipt");
    if (receiptFile !== null && !(receiptFile instanceof File)) return validationResponse();
    let attachment: ReceiptUploadInput | undefined;
    if (receiptFile instanceof File) {
      const data = new Uint8Array(await receiptFile.arrayBuffer());
      attachment = { fileName: receiptFile.name, contentType: receiptFile.type || "application/octet-stream", data };
    }
    const claim = await commands.createDraft(actorId, {
      title,
      category,
      subCategory,
      remark,
      amountMinor,
      currency: "INR",
      expenseDate,
      attachment,
      payoutDetails: { accountNumber, ifscCode },
    });
    return Response.json({ claim }, { status: 201 });
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
    // copied into one (the 10 MB cap keeps the copy cheap).
    return new Response(new Uint8Array(receipt.data), {
      headers: {
        "content-type": receipt.contentType,
        "content-length": String(receipt.sizeBytes),
        "content-disposition": `inline; filename="${sanitizeFileName(receipt.fileName)}"`,
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
    return Response.json({ claim: await commands.verifyClaim(actorId, claimId) });
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
    return Response.json({ claim: await commands.markPaid(actorId, claimId) });
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
  const status = error.code === "unauthorized" ? 403 : error.code === "not-found" ? 404 : error.code === "conflict" ? 409 : 422;
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
