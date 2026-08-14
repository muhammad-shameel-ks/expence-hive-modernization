import { describe, expect, it } from "vitest";
import { createProfileCommands } from "./profile";
import { InMemoryExpenseStore } from "./in-memory";
import type { BankDetails, ExpenseEmployee, ExpenseRole } from "./ports";

// The default privilege catalog (ADR-0015, amended by ADR-0024/0026):
// submit-only except Manager +approve, Finance Head +finance +org activity
// +approve bank details, Finance Executive +finance.
const SUBMIT_ONLY = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: false,
  approveBankDetails: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

const ROLE_EXECUTIVE: ExpenseRole = { id: "role-executive", code: "executive", displayName: "Executive", capabilities: { ...SUBMIT_ONLY } };
const ROLE_MANAGER: ExpenseRole = { id: "role-manager", code: "manager", displayName: "Manager", capabilities: { ...SUBMIT_ONLY, canApprove: true } };
const ROLE_FINANCE_HEAD: ExpenseRole = { id: "role-finance-head", code: "finance-head", displayName: "Finance Head", capabilities: { ...SUBMIT_ONLY, canAccessFinance: true, canViewOrganizationActivity: true, approveBankDetails: true } };
const ROLE_FINANCE_EXECUTIVE: ExpenseRole = { id: "role-finance-executive", code: "finance-executive", displayName: "Finance Executive", capabilities: { ...SUBMIT_ONLY, canAccessFinance: true } };

function emp(
  id: string,
  name: string,
  role: ExpenseEmployee["role"],
  extra: Partial<ExpenseEmployee> = {},
): ExpenseEmployee {
  return {
    id,
    organizationId: "org-1",
    name,
    email: `${id}@hive.local`,
    departmentId: "dept-1",
    departmentName: "Engineering",
    role,
    active: true,
    managerId: null,
    ...extra,
  };
}

const employee = emp("emp-shameel", "Muhammad Shameel", ROLE_EXECUTIVE, { managerId: "emp-ada" });
const manager = emp("emp-ada", "Ada Lovelace", ROLE_MANAGER);
const financeHead = emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentName: "Finance" });
const financeExecutive = emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentName: "Finance" });

const BASE_EMPLOYEES: ExpenseEmployee[] = [employee, manager, financeHead, financeExecutive];

const APPROVED_DETAILS: BankDetails = {
  holderName: "Muhammad Shameel",
  accountNumber: "90123456789012",
  ifsc: "ICIC0004567",
  bankName: "ICICI Bank",
  branch: "Koramangala",
};

const NEW_DETAILS: BankDetails = {
  holderName: "Muhammad Shameel",
  accountNumber: "60123456789013",
  ifsc: "SBIN0002345",
  bankName: "State Bank of India",
  branch: "Whitefield",
};

function buildProfile(overrides: {
  employees?: ExpenseEmployee[];
  approvedBankDetails?: Record<string, BankDetails>;
} = {}) {
  const store = new InMemoryExpenseStore({
    employees: overrides.employees ?? BASE_EMPLOYEES,
    approvedBankDetails: overrides.approvedBankDetails ?? { "emp-shameel": APPROVED_DETAILS },
  });
  const commands = createProfileCommands({
    store,
    idFactory: (() => {
      const counters = new Map<string, number>();
      return (prefix: string) => {
        const next = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, next);
        return `${prefix}-${next}`;
      };
    })(),
    now: () => new Date("2026-08-04T10:00:00.000Z"),
  });
  return { store, commands };
}

describe("profile commands", () => {
  it("reads the identity, the manager, the approved account, and the change history", async () => {
    const { commands } = buildProfile();

    const profile = await commands.getProfile("emp-shameel");

    expect(profile).toMatchObject({
      employee: { id: "emp-shameel", name: "Muhammad Shameel", email: "emp-shameel@hive.local" },
      department: "Engineering",
      manager: { id: "emp-ada", name: "Ada Lovelace" },
      approvedBankDetails: APPROVED_DETAILS,
      requests: [],
    });
  });

  it("rejects an inactive or unknown viewer", async () => {
    const { commands } = buildProfile();

    await expect(commands.getProfile("emp-gone")).rejects.toMatchObject({
      code: "unauthorized",
    });

    const store = new InMemoryExpenseStore({
      employees: [{ ...employee, active: false }],
    });
    const inactive = createProfileCommands({ store });
    await expect(inactive.getProfile("emp-shameel")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  describe("personal details", () => {
    it("updates the employee's phone and returns the refreshed record", async () => {
      const { commands } = buildProfile();

      const updated = await commands.updatePersonalDetails("emp-shameel", {
        phone: "+91 98765 43210",
      });

      expect(updated.phone).toBe("+91 98765 43210");
      const profile = await commands.getProfile("emp-shameel");
      expect(profile.employee.phone).toBe("+91 98765 43210");
    });

    it("clears the phone when saved empty", async () => {
      const { commands } = buildProfile();

      await commands.updatePersonalDetails("emp-shameel", { phone: "  " });

      const profile = await commands.getProfile("emp-shameel");
      expect(profile.employee.phone).toBeUndefined();
    });

    it("rejects a malformed phone number", async () => {
      const { commands } = buildProfile();

      await expect(
        commands.updatePersonalDetails("emp-shameel", { phone: "not-a-phone!" }),
      ).rejects.toMatchObject({ code: "validation" });
    });
  });

  describe("submitBankDetailChange", () => {
    it("creates a pending request with a submitted history event and normalized IFSC", async () => {
      const { commands } = buildProfile();

      const request = await commands.submitBankDetailChange("emp-shameel", {
        ...NEW_DETAILS,
        ifsc: "sbin0002345",
      });

      expect(request).toMatchObject({
        employeeId: "emp-shameel",
        status: "pending",
        requesterId: "emp-shameel",
        requested: { ...NEW_DETAILS, ifsc: "SBIN0002345" },
        history: [{ kind: "submitted", actorId: "emp-shameel" }],
      });
      expect(request.reviewerId).toBeUndefined();
      expect(request.reviewedAt).toBeUndefined();
    });

    it("keeps the previous approved account active while the change is pending", async () => {
      const { commands } = buildProfile();

      await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      const profile = await commands.getProfile("emp-shameel");
      expect(profile.approvedBankDetails).toEqual(APPROVED_DETAILS);
      expect(profile.requests).toHaveLength(1);
    });

    it("refuses a second pending change while one is undecided", async () => {
      const { commands } = buildProfile();
      await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      await expect(
        commands.submitBankDetailChange("emp-shameel", APPROVED_DETAILS),
      ).rejects.toMatchObject({
        code: "conflict",
        message: "You already have a pending bank-detail change request.",
      });
    });

    it("validates the account number and IFSC formats on save", async () => {
      const { commands } = buildProfile();

      await expect(
        commands.submitBankDetailChange("emp-shameel", { ...NEW_DETAILS, accountNumber: "12" }),
      ).rejects.toMatchObject({ code: "validation" });
      await expect(
        commands.submitBankDetailChange("emp-shameel", { ...NEW_DETAILS, accountNumber: "12ab34567890" }),
      ).rejects.toMatchObject({ code: "validation" });
      await expect(
        commands.submitBankDetailChange("emp-shameel", { ...NEW_DETAILS, ifsc: "SBIN2345" }),
      ).rejects.toMatchObject({ code: "validation" });
      await expect(
        commands.submitBankDetailChange("emp-shameel", { ...NEW_DETAILS, ifsc: "SBIN00023456" }),
      ).rejects.toMatchObject({ code: "validation" });
      await expect(
        commands.submitBankDetailChange("emp-shameel", { ...NEW_DETAILS, ifsc: "SB1N0002345" }),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("requires the holder name, bank name, and branch", async () => {
      const { commands } = buildProfile();

      await expect(
        commands.submitBankDetailChange("emp-shameel", { ...NEW_DETAILS, holderName: "  " }),
      ).rejects.toMatchObject({ code: "validation" });
      await expect(
        commands.submitBankDetailChange("emp-shameel", { ...NEW_DETAILS, bankName: "" }),
      ).rejects.toMatchObject({ code: "validation" });
      await expect(
        commands.submitBankDetailChange("emp-shameel", { ...NEW_DETAILS, branch: "" }),
      ).rejects.toMatchObject({ code: "validation" });
    });
  });

  describe("approveBankDetailChange", () => {
    it("activates the requested details and records the reviewer on the history", async () => {
      const { commands } = buildProfile();
      const request = await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      const approved = await commands.approveBankDetailChange("emp-pramod", request.id);

      expect(approved).toMatchObject({
        status: "approved",
        reviewerId: "emp-pramod",
        reviewedAt: "2026-08-04T10:00:00.000Z",
        history: [
          { kind: "submitted", actorId: "emp-shameel" },
          { kind: "approved", actorId: "emp-pramod", actorName: "Pramod" },
        ],
      });
      const profile = await commands.getProfile("emp-shameel");
      expect(profile.approvedBankDetails).toEqual(NEW_DETAILS);
    });

    it("requires the approve bank detail changes privilege", async () => {
      const { commands } = buildProfile();
      const request = await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      await expect(
        commands.approveBankDetailChange("emp-ada", request.id),
      ).rejects.toMatchObject({
        code: "unauthorized",
        message: "Your role does not have the approve bank detail changes privilege.",
      });
    });

    it("forbids self-approval even for a privilege holder", async () => {
      const { commands } = buildProfile();
      const request = await commands.submitBankDetailChange("emp-pramod", {
        holderName: "Pramod",
        accountNumber: "30123456789019",
        ifsc: "SBIN0002345",
        bankName: "State Bank of India",
        branch: "Whitefield",
      });

      await expect(
        commands.approveBankDetailChange("emp-pramod", request.id),
      ).rejects.toMatchObject({
        code: "unauthorized",
        message: "You cannot approve your own bank-detail change.",
      });
    });

    it("does not approve a request from another organization", async () => {
      const { commands } = buildProfile();
      const request = await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      const otherOrg = new InMemoryExpenseStore({
        employees: [{ ...financeHead, id: "emp-other", organizationId: "org-2", name: "Other" }],
      });
      const otherCommands = createProfileCommands({ store: otherOrg });
      await expect(otherCommands.approveBankDetailChange("emp-other", request.id)).rejects.toMatchObject({
        code: "not-found",
      });
    });

    it("refuses to approve an already-decided request", async () => {
      const { commands } = buildProfile();
      const request = await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);
      await commands.approveBankDetailChange("emp-pramod", request.id);

      await expect(
        commands.approveBankDetailChange("emp-pramod", request.id),
      ).rejects.toMatchObject({
        code: "conflict",
        message: "This bank-detail change request is already decided.",
      });
    });
  });

  describe("rejectBankDetailChange", () => {
    it("keeps the previous account active and records the reason and reviewer", async () => {
      const { commands } = buildProfile();
      const request = await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      const rejected = await commands.rejectBankDetailChange(
        "emp-pramod",
        request.id,
        "Account number does not match the holder's PAN records.",
      );

      expect(rejected).toMatchObject({
        status: "rejected",
        reviewerId: "emp-pramod",
        rejectionReason: "Account number does not match the holder's PAN records.",
        history: [
          { kind: "submitted", actorId: "emp-shameel" },
          { kind: "rejected", actorId: "emp-pramod", detail: "Account number does not match the holder's PAN records." },
        ],
      });
      const profile = await commands.getProfile("emp-shameel");
      expect(profile.approvedBankDetails).toEqual(APPROVED_DETAILS);
    });

    it("requires the privilege, a reason, and refuses self-rejection", async () => {
      const { commands } = buildProfile();
      const request = await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      await expect(commands.rejectBankDetailChange("emp-ada", request.id, "nope")).rejects.toMatchObject({
        code: "unauthorized",
      });
      await expect(commands.rejectBankDetailChange("emp-pramod", request.id, "  ")).rejects.toMatchObject({
        code: "validation",
      });
      const own = await commands.submitBankDetailChange("emp-pramod", {
        holderName: "Pramod",
        accountNumber: "30123456789019",
        ifsc: "SBIN0002345",
        bankName: "State Bank of India",
        branch: "Whitefield",
      });
      await expect(commands.rejectBankDetailChange("emp-pramod", own.id, "nope")).rejects.toMatchObject({
        code: "unauthorized",
        message: "You cannot reject your own bank-detail change.",
      });
    });
  });

  describe("listPendingBankDetailChanges", () => {
    it("lists pending requests enriched with requester identity and the current approved account", async () => {
      const { commands } = buildProfile();
      const request = await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      const pending = await commands.listPendingBankDetailChanges("emp-pramod");

      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        id: request.id,
        requesterName: "Muhammad Shameel",
        requesterRole: "Executive",
        currentApproved: APPROVED_DETAILS,
        requested: NEW_DETAILS,
      });
    });

    it("requires the approve bank detail changes privilege", async () => {
      const { commands } = buildProfile();

      await expect(commands.listPendingBankDetailChanges("emp-shameel")).rejects.toMatchObject({
        code: "unauthorized",
      });
    });

    it("excludes requests the viewer cannot touch from another org", async () => {
      const { commands } = buildProfile();
      await commands.submitBankDetailChange("emp-shameel", NEW_DETAILS);

      const otherOrg = new InMemoryExpenseStore({
        employees: [{ ...financeHead, id: "emp-other", organizationId: "org-2", name: "Other" }],
      });
      const otherCommands = createProfileCommands({ store: otherOrg });
      await expect(otherCommands.listPendingBankDetailChanges("emp-other")).resolves.toEqual([]);
    });
  });
});
