import { resolveRoleCapabilities } from "../shared/authorization";
import { ExpenseError } from "./commands";
import type {
  BankDetailChangeRequest,
  BankDetails,
  ExpenseEmployee,
  ExpenseStore,
} from "./ports";

// Profile and bank details (ADR-0024). Bank details are never written
// directly: an employee submits a change request, and only a role carrying
// the `approve bank detail changes` privilege can approve it - never the
// requester themselves. The employee's active bank details are the details
// of their last approved request; the submission gate on claims reads them
// live, and the payment register export (slice 06) will too.

const IFSC_PATTERN = /^[A-Z]{4}[0-9A-Z]{7}$/;
const ACCOUNT_NUMBER_PATTERN = /^[0-9]{9,18}$/;
const PHONE_PATTERN = /^[0-9+\-() ]{6,20}$/;
const MAX_REJECTION_REASON_LENGTH = 200;

export type Profile = {
  // The identity display: name, email, role, department, and manager come
  // from the employee record; role/department/manager are read-only here.
  employee: ExpenseEmployee;
  department: string | null;
  manager: { id: string; name: string } | null;
  // The currently active account, or null when no approved request exists
  // yet (submission stays blocked until one does).
  approvedBankDetails: BankDetails | null;
  // The employee's own change-request history, newest first.
  requests: BankDetailChangeRequest[];
};

// One pending request on the finance approval surface, enriched with the
// requester's display identity and their currently active account so the
// reviewer sees current and requested details side by side.
export type PendingBankDetailChange = BankDetailChangeRequest & {
  requesterName: string;
  requesterRole?: string;
  currentApproved: BankDetails | null;
};

export type ProfileCommands = {
  getProfile(actorId: string): Promise<Profile>;
  updatePersonalDetails(actorId: string, input: { phone: string }): Promise<ExpenseEmployee>;
  submitBankDetailChange(actorId: string, input: BankDetails): Promise<BankDetailChangeRequest>;
  approveBankDetailChange(actorId: string, requestId: string): Promise<BankDetailChangeRequest>;
  rejectBankDetailChange(
    actorId: string,
    requestId: string,
    reason: string,
  ): Promise<BankDetailChangeRequest>;
  listPendingBankDetailChanges(actorId: string): Promise<PendingBankDetailChange[]>;
};

export function createProfileCommands({
  store,
  now = () => new Date(),
  idFactory = (prefix) => `${prefix}-${crypto.randomUUID()}`,
}: {
  store: ExpenseStore;
  now?: () => Date;
  idFactory?: (prefix: string) => string;
}): ProfileCommands {
  async function requireEmployee(actorId: string): Promise<ExpenseEmployee> {
    const employee = await store.getEmployee(actorId);
    if (!employee || !employee.active) {
      throw new ExpenseError("unauthorized", "The current user is not an active employee.");
    }
    return employee;
  }

  function canApproveBankDetails(employee: ExpenseEmployee): boolean {
    return (
      employee.role !== null && resolveRoleCapabilities(employee.role).approveBankDetails
    );
  }

  return {
    async getProfile(actorId) {
      const employee = await requireEmployee(actorId);
      const [employees, approvedBankDetails, requests] = await Promise.all([
        store.listEmployees(employee.organizationId),
        store.getApprovedBankDetails(actorId),
        store.listBankDetailChangeRequests(actorId),
      ]);
      const manager = employee.managerId
        ? employees.find((candidate) => candidate.id === employee.managerId)
        : null;
      return {
        employee,
        department: employee.departmentName ?? null,
        manager: manager ? { id: manager.id, name: manager.name } : null,
        approvedBankDetails,
        requests,
      };
    },

    async updatePersonalDetails(actorId, input) {
      await requireEmployee(actorId);
      const phone = input.phone.trim();
      if (phone && !PHONE_PATTERN.test(phone)) {
        throw new ExpenseError(
          "validation",
          "Enter a valid phone number (6 to 20 digits, with optional +, -, parentheses, and spaces).",
        );
      }
      await store.updatePersonalDetails(actorId, { phone });
      const updated = await store.getEmployee(actorId);
      if (!updated) {
        throw new ExpenseError("unauthorized", "The current user is not an active employee.");
      }
      return updated;
    },

    async submitBankDetailChange(actorId, input) {
      const employee = await requireEmployee(actorId);
      const requested = normalizeBankDetails(input);
      validateBankDetails(requested);
      // One pending change at a time: a second request while the first is
      // undecided would split the reviewer's attention and leave two
      // candidates for the same account.
      const existing = await store.listBankDetailChangeRequests(actorId);
      if (existing.some((request) => request.status === "pending")) {
        throw new ExpenseError(
          "conflict",
          "You already have a pending bank-detail change request.",
        );
      }
      const createdAt = now().toISOString();
      const request: BankDetailChangeRequest = {
        id: idFactory("bank-change"),
        organizationId: employee.organizationId,
        employeeId: actorId,
        status: "pending",
        requested,
        requesterId: actorId,
        requestedAt: createdAt,
        history: [{ id: idFactory("history"), kind: "submitted", actorId, createdAt }],
      };
      await store.createBankDetailChangeRequest(request);
      return request;
    },

    async approveBankDetailChange(actorId, requestId) {
      const actor = await requireEmployee(actorId);
      if (!canApproveBankDetails(actor)) {
        throw new ExpenseError(
          "unauthorized",
          "Your role does not have the approve bank detail changes privilege.",
        );
      }
      const request = await requireOrgRequest(actor.organizationId, requestId);
      if (request.status !== "pending") {
        throw new ExpenseError("conflict", "This bank-detail change request is already decided.");
      }
      // Self-approval is impossible (ADR-0024): the change must route to
      // another holder of the privilege.
      if (request.requesterId === actorId) {
        throw new ExpenseError(
          "unauthorized",
          "You cannot approve your own bank-detail change.",
        );
      }
      const reviewedAt = now().toISOString();
      request.status = "approved";
      request.reviewerId = actorId;
      request.reviewedAt = reviewedAt;
      request.history.push({
        id: idFactory("history"),
        kind: "approved",
        actorId,
        actorName: actor.name,
        createdAt: reviewedAt,
      });
      await store.updateBankDetailChangeRequest(request);
      return request;
    },

    async rejectBankDetailChange(actorId, requestId, reason) {
      const actor = await requireEmployee(actorId);
      if (!canApproveBankDetails(actor)) {
        throw new ExpenseError(
          "unauthorized",
          "Your role does not have the approve bank detail changes privilege.",
        );
      }
      const request = await requireOrgRequest(actor.organizationId, requestId);
      if (request.status !== "pending") {
        throw new ExpenseError("conflict", "This bank-detail change request is already decided.");
      }
      if (request.requesterId === actorId) {
        throw new ExpenseError(
          "unauthorized",
          "You cannot reject your own bank-detail change.",
        );
      }
      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        throw new ExpenseError("validation", "A reason is required to reject a bank-detail change.");
      }
      if (trimmedReason.length > MAX_REJECTION_REASON_LENGTH) {
        throw new ExpenseError("validation", "Reason is too long.");
      }
      const reviewedAt = now().toISOString();
      request.status = "rejected";
      request.reviewerId = actorId;
      request.reviewedAt = reviewedAt;
      request.rejectionReason = trimmedReason;
      request.history.push({
        id: idFactory("history"),
        kind: "rejected",
        actorId,
        actorName: actor.name,
        detail: trimmedReason,
        createdAt: reviewedAt,
      });
      await store.updateBankDetailChangeRequest(request);
      return request;
    },

    async listPendingBankDetailChanges(actorId) {
      const actor = await requireEmployee(actorId);
      if (!canApproveBankDetails(actor)) {
        throw new ExpenseError(
          "unauthorized",
          "Only roles with the approve bank detail changes privilege can review bank-detail requests.",
        );
      }
      const [requests, employees, approved] = await Promise.all([
        store.listPendingBankDetailChangeRequests(actor.organizationId),
        store.listEmployees(actor.organizationId),
        store.listApprovedBankDetails(actor.organizationId),
      ]);
      const approvedByEmployee = new Map(
        approved.map((entry) => [entry.employeeId, entry.details]),
      );
      return requests.map((request) => {
        const requester = employees.find((candidate) => candidate.id === request.employeeId);
        return {
          ...request,
          requesterName: requester?.name ?? "Unknown",
          requesterRole: requester?.role?.displayName ?? undefined,
          currentApproved: approvedByEmployee.get(request.employeeId) ?? null,
        };
      });
    },
  };

  async function requireOrgRequest(
    organizationId: string,
    requestId: string,
  ): Promise<BankDetailChangeRequest> {
    const request = await store.getBankDetailChangeRequest(requestId);
    if (!request || request.organizationId !== organizationId) {
      throw new ExpenseError("not-found", "Bank-detail change request does not exist.");
    }
    return request;
  }
}

// The normalized input: trimmed fields and an uppercased IFSC, so a
// reviewer never sees a formatting inconsistency the employee's keystrokes
// produced.
function normalizeBankDetails(input: BankDetails): BankDetails {
  return {
    holderName: input.holderName.trim(),
    accountNumber: input.accountNumber.trim(),
    ifsc: input.ifsc.trim().toUpperCase(),
    bankName: input.bankName.trim(),
    branch: input.branch.trim(),
  };
}

// Format checks on save (ADR-0024): the account number must be a
// reasonable digit length, and the IFSC must be exactly 11 characters,
// four letters followed by seven alphanumerics (the India IFSC format).
function validateBankDetails(input: BankDetails): void {
  if (!input.holderName) {
    throw new ExpenseError("validation", "Enter the account holder name.");
  }
  if (!ACCOUNT_NUMBER_PATTERN.test(input.accountNumber)) {
    throw new ExpenseError(
      "validation",
      "Enter a valid account number (9 to 18 digits, no spaces or dashes).",
    );
  }
  if (!IFSC_PATTERN.test(input.ifsc)) {
    throw new ExpenseError(
      "validation",
      "Enter a valid IFSC code: exactly 11 characters, 4 letters followed by 7 alphanumerics.",
    );
  }
  if (!input.bankName) {
    throw new ExpenseError("validation", "Enter the bank name.");
  }
  if (!input.branch) {
    throw new ExpenseError("validation", "Enter the branch.");
  }
}
