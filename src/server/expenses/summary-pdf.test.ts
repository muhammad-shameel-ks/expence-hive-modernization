import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { InMemoryBlobStore } from "../blob/fakes";
import { createExpenseCommands, type ExpenseCommands } from "./commands";
import { InMemoryExpenseStore } from "./in-memory";
import type { ExpenseEmployee } from "./ports";
import { buildExpenseSummaryPdf } from "./summary-pdf";

// The default privilege catalog (ADR-0015) the migration and seeds backfill:
// submit-only except Manager +approve, Finance Head +finance +org activity,
// Finance Executive +finance.
const SUBMIT_ONLY = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: false,
  canHold: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

const ROLE_EXECUTIVE = { id: "role-executive", code: "executive", displayName: "Executive", capabilities: { ...SUBMIT_ONLY } };
const ROLE_MANAGER = { id: "role-manager", code: "manager", displayName: "Manager", capabilities: { ...SUBMIT_ONLY, canApprove: true } };
const ROLE_FINANCE_HEAD = { id: "role-finance-head", code: "finance-head", displayName: "Finance Head", capabilities: { ...SUBMIT_ONLY, canAccessFinance: true, canViewOrganizationActivity: true } };
const ROLE_FINANCE_EXECUTIVE = { id: "role-finance-executive", code: "finance-executive", displayName: "Finance Executive", capabilities: { ...SUBMIT_ONLY, canAccessFinance: true } };

const PDF_RECEIPT = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]); // "%PDF-1.4\n"

function emp(
  id: string,
  name: string,
  role: ExpenseEmployee["role"],
  extra: Partial<ExpenseEmployee> = {},
): ExpenseEmployee {
  return { id, organizationId: "org-1", name, role, active: true, managerId: null, ...extra };
}

function build() {
  const store = new InMemoryExpenseStore({
    employees: [
      emp("emp-shameel", "Muhammad Shameel", ROLE_EXECUTIVE, { departmentId: "dept-eng", managerId: "emp-ada" }),
      emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
      emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
      emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
    ],
    flows: [
      {
        id: "flow-standard",
        roleId: ROLE_EXECUTIVE.id,
        steps: [
          { kind: "role", roleId: ROLE_MANAGER.id },
          { kind: "role", roleId: ROLE_FINANCE_HEAD.id },
          { kind: "role", roleId: ROLE_FINANCE_EXECUTIVE.id },
        ],
      },
    ],
  });
  const blobStore = new InMemoryBlobStore();
  const commands = createExpenseCommands({
    store,
    blobStore,
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
  return { commands, blobStore };
}

async function createSubmittedClaim(commands: ExpenseCommands, withReceipt = true) {
  const claim = await commands.createDraft("emp-shameel", {
    title: "Taxi",
    category: "Travel",
    subCategory: "Cab/Taxi",
    remark: "Airport pickup",
    amountMinor: 85000,
    currency: "INR",
    expenseDate: "2026-08-04",
    attachment: withReceipt
      ? { fileName: "boarding-pass.pdf", contentType: "application/pdf", data: PDF_RECEIPT }
      : undefined,
  });
  return commands.submitClaim("emp-shameel", claim.id);
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: bytes }).promise;
  const texts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ((item as { str?: string }).str ?? "")).join(" "));
  }
  return texts.join("\n");
}

describe("expense summary PDF builder", () => {
  it("produces PDF bytes with facts, journey, and comments for a submitted claim", async () => {
    const { commands } = build();
    const submitted = await createSubmittedClaim(commands);
    await commands.approveStage("emp-ada", submitted.id);
    await commands.updateComments("emp-finance", submitted.id, "Awaiting invoice copy");
    const [claim, employees, receipt] = await Promise.all([
      commands.getClaim("emp-shameel", submitted.id),
      commands.listEmployees("emp-shameel"),
      commands.getReceipt("emp-shameel", submitted.id),
    ]);

    const bytes = await buildExpenseSummaryPdf({ claim, employees, receipt });

    expect(Array.from(bytes.slice(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(PDFDocument.load(bytes)).resolves.toBeInstanceOf(PDFDocument);

    const text = await extractText(bytes);
    expect(text).toContain("Expense summary");
    expect(text).toContain(claim.ref);
    expect(text).toContain("₹850.00");
    expect(text).toContain("Muhammad Shameel");
    expect(text).toContain("Manager - Approved · Aug 4, 2026, 10:00 AM");
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Finance Head - Pending");
    expect(text).toContain("Awaiting invoice copy");
    expect(text).toContain("boarding-pass.pdf");
  });

  it("embeds the original receipt as a PDF file attachment when bytes are provided", async () => {
    const { commands } = build();
    const submitted = await createSubmittedClaim(commands);
    const [claim, employees, receipt] = await Promise.all([
      commands.getClaim("emp-shameel", submitted.id),
      commands.listEmployees("emp-shameel"),
      commands.getReceipt("emp-shameel", submitted.id),
    ]);

    const bytes = await buildExpenseSummaryPdf({ claim, employees, receipt });
    const pdfDoc = await PDFDocument.load(bytes);

    const names = pdfDoc.catalog.lookup(PDFName.of("Names"), PDFDict);
    const embeddedFiles = names.lookup(PDFName.of("EmbeddedFiles"), PDFDict);
    const fileNames = embeddedFiles.lookup(PDFName.of("Names"));
    expect(fileNames.size()).toBe(2);
  });

  it("attaches no file when no receipt bytes are provided", async () => {
    const { commands } = build();
    const submitted = await createSubmittedClaim(commands, false);
    const [claim, employees] = await Promise.all([
      commands.getClaim("emp-shameel", submitted.id),
      commands.listEmployees("emp-shameel"),
    ]);

    const bytes = await buildExpenseSummaryPdf({ claim, employees });
    const pdfDoc = await PDFDocument.load(bytes);

    expect(pdfDoc.catalog.has(PDFName.of("Names"))).toBe(false);
  });

  it("renders an empty-journey draft gracefully without an approval section", async () => {
    const { commands } = build();
    const draft = await commands.createDraft("emp-shameel", {
      title: "Taxi",
      category: "Travel",
      subCategory: "Cab/Taxi",
      remark: "Airport pickup",
      amountMinor: 85000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });
    const [claim, employees] = await Promise.all([
      commands.getClaim("emp-shameel", draft.id),
      commands.listEmployees("emp-shameel"),
    ]);

    const bytes = await buildExpenseSummaryPdf({ claim, employees });

    expect(Array.from(bytes.slice(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(PDFDocument.load(bytes)).resolves.toBeInstanceOf(PDFDocument);

    const text = await extractText(bytes);
    expect(text).toContain("Expense summary");
    expect(text).toContain("Draft");
    expect(text).not.toContain("Approval journey");
    expect(text).not.toContain("Comments");
  });

  it("renders the latest rejection as a read-only entry in the comment section", async () => {
    const { commands } = build();
    const submitted = await createSubmittedClaim(commands);
    await commands.rejectClaim("emp-ada", submitted.id, "Missing itemized receipt");
    const [claim, employees] = await Promise.all([
      commands.getClaim("emp-shameel", submitted.id),
      commands.listEmployees("emp-shameel"),
    ]);

    const bytes = await buildExpenseSummaryPdf({ claim, employees });

    const text = await extractText(bytes);
    expect(text).toContain("Comments");
    expect(text).toContain("Rejection reason");
    expect(text).toContain("Missing itemized receipt");
    expect(text).toContain("Rejected by: Ada Lovelace");
    expect(text).toContain("Rejected on: Aug 4, 2026, 10:00 AM");
  });

  it("paginates a long wrapped comment instead of clipping it", async () => {
    const { commands } = build();
    const submitted = await createSubmittedClaim(commands);
    await commands.updateComments(
      "emp-finance",
      submitted.id,
      `${"Finance note. ".repeat(300)}Final sentence of the comment.`,
    );
    const [claim, employees] = await Promise.all([
      commands.getClaim("emp-shameel", submitted.id),
      commands.listEmployees("emp-shameel"),
    ]);

    const bytes = await buildExpenseSummaryPdf({ claim, employees });

    const pdfDoc = await PDFDocument.load(bytes);
    expect(pdfDoc.getPageCount()).toBeGreaterThan(1);
    const text = await extractText(bytes);
    expect(text).toContain("Final sentence of the comment.");
  });

  it("notes the fallback font in the PDF when Geist is unavailable", async () => {
    const { commands } = build();
    const submitted = await createSubmittedClaim(commands);
    const [claim, employees] = await Promise.all([
      commands.getClaim("emp-shameel", submitted.id),
      commands.listEmployees("emp-shameel"),
    ]);

    const bytes = await buildExpenseSummaryPdf(
      { claim, employees },
      { geistFontDir: "/nonexistent/geist-fonts" },
    );

    const text = await extractText(bytes);
    expect(text).toContain("Expense summary");
    expect(text).toContain("fallback font in use");
  });

  it("renders an amount-guard auto-skipped step with its reason in the journey", async () => {
    const store = new InMemoryExpenseStore({
      employees: [
        emp("emp-shameel", "Muhammad Shameel", ROLE_EXECUTIVE, { departmentId: "dept-eng", managerId: "emp-ada" }),
        emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
        emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
        emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
      ],
      flows: [
        {
          id: "flow-guarded",
          roleId: ROLE_EXECUTIVE.id,
          steps: [
            { kind: "role", roleId: ROLE_MANAGER.id },
            { kind: "role", roleId: ROLE_FINANCE_HEAD.id, guard: { operator: "gte", amountMinor: 500000 } },
            { kind: "role", roleId: ROLE_FINANCE_EXECUTIVE.id },
          ],
        },
      ],
    });
    const commands = createExpenseCommands({
      store,
      blobStore: new InMemoryBlobStore(),
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
    const submitted = await commands.submitClaim("emp-shameel", (await commands.createDraft("emp-shameel", {
      title: "Taxi",
      category: "Travel",
      subCategory: "Cab/Taxi",
      remark: "Airport pickup",
      amountMinor: 30000,
      currency: "INR",
      expenseDate: "2026-08-04",
    })).id);
    const [claim, employees] = await Promise.all([
      commands.getClaim("emp-shameel", submitted.id),
      commands.listEmployees("emp-shameel"),
    ]);

    const bytes = await buildExpenseSummaryPdf({ claim, employees });

    const text = await extractText(bytes);
    expect(text).toContain("Finance Head - Auto-skipped");
    expect(text).toContain("Total ₹300 under ₹5000 guard on Finance Head step");
  });
});
