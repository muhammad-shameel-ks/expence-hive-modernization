import { isExpenseError } from "./commands";
import { expenseErrorResponse } from "./http";
import type { ProfileCommands } from "./profile";
import type { BankDetails } from "./ports";

// The HTTP boundary for the profile and bank-details commands (ADR-0024).
// Shapes the JSON bodies, calls the command layer, and maps errors through
// the shared expense error response. All routes require a session employee
// id, resolved by the route guard before the handler runs.

function readBody(request: Request): Promise<unknown | null> {
  return request.json().catch(() => null);
}

function validationResponse(message: string): Response {
  return Response.json({ error: "validation", message }, { status: 422 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bankDetailsFromBody(body: Record<string, unknown>): BankDetails | null {
  const { holderName, accountNumber, ifsc, bankName, branch } = body;
  if (
    typeof holderName !== "string" ||
    typeof accountNumber !== "string" ||
    typeof ifsc !== "string" ||
    typeof bankName !== "string" ||
    typeof branch !== "string"
  ) {
    return null;
  }
  return { holderName, accountNumber, ifsc, bankName, branch };
}

export async function handleGetProfileRequest(
  _request: Request,
  commands: ProfileCommands,
  actorId: string,
): Promise<Response> {
  try {
    const profile = await commands.getProfile(actorId);
    return Response.json({ profile });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleUpdatePersonalDetailsRequest(
  request: Request,
  commands: ProfileCommands,
  actorId: string,
): Promise<Response> {
  try {
    const body = await readBody(request);
    if (!isRecord(body) || typeof body.phone !== "string") {
      return validationResponse("A phone number is required.");
    }
    const employee = await commands.updatePersonalDetails(actorId, { phone: body.phone });
    return Response.json({ employee });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleSubmitBankDetailChangeRequest(
  request: Request,
  commands: ProfileCommands,
  actorId: string,
): Promise<Response> {
  try {
    const body = await readBody(request);
    if (!isRecord(body)) return validationResponse("Bank details are required.");
    const details = bankDetailsFromBody(body);
    if (!details) {
      return validationResponse("Bank details are required.");
    }
    const bankChange = await commands.submitBankDetailChange(actorId, details);
    return Response.json({ bankChange }, { status: 201 });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleListPendingBankDetailRequestsRequest(
  _request: Request,
  commands: ProfileCommands,
  actorId: string,
): Promise<Response> {
  try {
    const requests = await commands.listPendingBankDetailChanges(actorId);
    return Response.json({ requests });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleApproveBankDetailRequest(
  _request: Request,
  commands: ProfileCommands,
  actorId: string,
  requestId: string,
): Promise<Response> {
  try {
    const bankChange = await commands.approveBankDetailChange(actorId, requestId);
    return Response.json({ bankChange });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

export async function handleRejectBankDetailRequest(
  request: Request,
  commands: ProfileCommands,
  actorId: string,
  requestId: string,
): Promise<Response> {
  try {
    const body = await readBody(request);
    if (!isRecord(body) || typeof body.reason !== "string") {
      return validationResponse("A reason is required to reject a bank-detail change.");
    }
    const bankChange = await commands.rejectBankDetailChange(actorId, requestId, body.reason);
    return Response.json({ bankChange });
  } catch (error) {
    return expenseErrorResponse(error);
  }
}

// Shared error guard so handlers that only run for specific viewers can
// distinguish authorization failures from internal errors without reaching
// into Response internals.
export function isExpenseAuthError(error: unknown): boolean {
  return isExpenseError(error) && error.code === "unauthorized";
}
