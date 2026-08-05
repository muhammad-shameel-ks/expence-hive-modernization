import { isExpenseError, type ExpenseCommands } from "./commands";

export async function handleCreateExpenseRequest(
  request: Request,
  commands: ExpenseCommands,
  actorId: string,
): Promise<Response> {
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object") return validationResponse();
    const value = body as Record<string, unknown>;
    if (
      typeof value.title !== "string" ||
      typeof value.category !== "string" ||
      typeof value.subCategory !== "string" ||
      typeof value.remark !== "string" ||
      typeof value.amount !== "string" ||
      typeof value.expenseDate !== "string" ||
      typeof value.accountNumber !== "string" ||
      typeof value.ifscCode !== "string"
    ) {
      return validationResponse();
    }
    const amountMinor = parseAmount(value.amount);
    if (amountMinor === null) return validationResponse();
    const attachment = parseAttachment(value.attachment);
    if (value.attachment !== undefined && attachment === null) return validationResponse();
    const claim = await commands.createDraft(actorId, {
      title: value.title,
      category: value.category,
      subCategory: value.subCategory,
      remark: value.remark,
      amountMinor,
      currency: "INR",
      expenseDate: value.expenseDate,
      attachment: attachment ?? undefined,
      payoutDetails: { accountNumber: value.accountNumber, ifscCode: value.ifscCode },
    });
    return Response.json({ claim }, { status: 201 });
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

function parseAttachment(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.fileName !== "string" || typeof input.contentType !== "string") return null;
  return {
    fileName: input.fileName,
    contentType: input.contentType,
    storageKey: `local/${crypto.randomUUID()}/${input.fileName}`,
  };
}

function expenseErrorResponse(error: unknown): Response {
  if (!isExpenseError(error)) {
    console.error("expense command failed", error instanceof Error ? error : String(error));
    return Response.json({ error: "internal" }, { status: 500 });
  }
  const status = error.code === "unauthorized" ? 403 : error.code === "not-found" ? 404 : error.code === "conflict" ? 409 : 422;
  return Response.json({ error: error.code, message: error.message }, { status });
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
