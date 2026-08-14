// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PaymentQueueTable } from "./payment-queue-table";
import { PAYMENT_QUEUE_COLUMNS } from "./payment-queue-columns";
import { buildAndDownloadXlsx } from "./payment-queue-export";
import type { ExpenseClaim } from "@/server/expenses/ports";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

const downloadBlobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/download-blob", () => ({
  downloadBlob: downloadBlobMock,
}));

vi.mock("./payment-queue-export", () => ({
  buildAndDownloadXlsx: vi.fn(),
}));

const buildAndDownloadPaymentRegisterMock = vi.hoisted(() => vi.fn());

vi.mock("./payment-register-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./payment-register-export")>()),
  buildAndDownloadPaymentRegister: buildAndDownloadPaymentRegisterMock,
}));

const buildAndDownloadXlsxMock = vi.mocked(buildAndDownloadXlsx);

function buildClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return {
    id: "claim-1",
    ref: "EXP-0001",
    organizationId: "org-1",
    requesterId: "employee-1",
    title: "Client dinner",
    category: "Meals",
    subCategory: "",
    remark: "",
    amountMinor: 125000,
    currency: "INR",
    expenseDate: "2026-08-01",
    status: "in-finance",
    steps: [
      {
        id: "s-1",
        roleId: "role-finance-executive",
        status: "verified",
      },
    ],
    history: [],
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    submittedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildTerminalClaim(stepStatus: "pending" | "verified"): ExpenseClaim {
  return buildClaim({
    steps: [
      {
        id: "s-1",
        roleId: "role-finance-executive",
        status: stepStatus,
      },
    ],
  });
}

const FINANCE_EMPLOYEES = [
  { id: "employee-1", organizationId: "org-1", name: "Ada Lovelace", role: null, active: true, managerId: null },
  { id: "employee-2", organizationId: "org-1", name: "Grace Hopper", role: null, active: true, managerId: null },
];

describe("PaymentQueueTable comment save loading state", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})), // never resolves until we control it below
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("marks the comment input busy and shows a spinner while the save is pending", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const claim = buildClaim();
    render(<PaymentQueueTable claims={[claim]} employees={[]} />);

    const input = screen.getByRole("textbox", { name: `Comment for ${claim.ref}` });
    expect(input).not.toHaveAttribute("aria-busy");

    input.focus();
    (input as HTMLInputElement).value = "Approved by finance";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();

    // While the PATCH request is in flight, the input surfaces the pending
    // save via aria-busy/disabled and the inline spinner remains visible.
    await waitFor(() => expect(input).toHaveAttribute("aria-busy", "true"));
    expect(input).toBeDisabled();
    expect(document.querySelector(".animate-spin")).not.toBeNull();

    resolveFetch(new Response(null, { status: 200 }));

    await waitFor(() => expect(input).not.toHaveAttribute("aria-busy"));
    expect(input).not.toBeDisabled();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });

  it("marks the comment input busy and shows a spinner when saving via Enter key", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const claim = buildClaim();
    render(<PaymentQueueTable claims={[claim]} employees={[]} />);

    const input = screen.getByRole("textbox", { name: `Comment for ${claim.ref}` });

    input.focus();
    (input as HTMLInputElement).value = "Enter key comment";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(input).toHaveAttribute("aria-busy", "true"));
    expect(input).toBeDisabled();
    expect(document.querySelector(".animate-spin")).not.toBeNull();

    resolveFetch(new Response(null, { status: 200 }));

    await waitFor(() => expect(input).not.toHaveAttribute("aria-busy"));
    expect(input).not.toBeDisabled();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });
});

describe("PaymentQueueTable terminal pay action (verified-only queue, ADR-0023)", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("never renders a not-yet-verified in-finance claim in the queue", () => {
    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("pending")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.queryByRole("button", { name: "Verify for payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
    expect(screen.getByText("No claims match your search.")).toBeInTheDocument();
  });

  it("offers Mark paid on a verified claim to a terminal pool member", () => {
    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("verified")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.getByRole("button", { name: "Mark paid" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Verify for payment" })).not.toBeInTheDocument();
  });

  it("hides the action when the viewer holds a different role than the terminal step", () => {
    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("verified")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-head"
      />,
    );

    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("never renders paid claims in the queue", () => {
    const paid = buildTerminalClaim("verified");
    paid.status = "paid";
    render(
      <PaymentQueueTable
        claims={[paid]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
    expect(screen.getByText("No claims match your search.")).toBeInTheDocument();
  });

  it("hides the action when the viewer is the requester of the claim", () => {
    const claim = buildTerminalClaim("verified");
    claim.requesterId = "emp-finance-2";
    render(
      <PaymentQueueTable
        claims={[claim]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("POSTs pay and refreshes the queue on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ claim: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("verified")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/claim-1/pay", { method: "POST" });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("surfaces the server's error message inline when the action fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "You are not eligible to process this claim's terminal stage." }), {
          status: 403,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("verified")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));

    await waitFor(() =>
      expect(
        screen.getByText("You are not eligible to process this claim's terminal stage."),
      ).toBeInTheDocument(),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("PaymentQueueTable verified claims", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the verified flow status with no Held badge anywhere", () => {
    render(<PaymentQueueTable claims={[buildTerminalClaim("verified")]} employees={[]} />);

    expect(screen.getByText("in-finance")).toBeInTheDocument();
    expect(screen.queryByText("Held")).not.toBeInTheDocument();
  });

  it("offers Mark paid to a terminal pool member", () => {
    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("verified")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
  });

  it("offers pay on a verified-but-unpaid claim", () => {
    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("verified")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
  });
});

describe("PaymentQueueTable rejected rows never appear (ADR-0023)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function buildRejectedClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
    return buildClaim({
      id: "claim-rejected",
      ref: "EXP-0002",
      title: "Team lunch",
      status: "rejected",
      steps: [
        {
          id: "s-1",
          roleId: "role-finance-executive",
          status: "rejected",
          decidedAt: "2026-08-03T11:00:00.000Z",
        },
      ],
      history: [
        { id: "h-1", kind: "draft", actorId: "employee-1", createdAt: "2026-08-01T09:00:00.000Z" },
        { id: "h-2", kind: "submitted", actorId: "employee-1", createdAt: "2026-08-01T10:00:00.000Z" },
        {
          id: "h-3",
          kind: "rejected",
          actorId: "employee-2",
          detail: "Missing itemized receipt",
          createdAt: "2026-08-03T11:00:00.000Z",
        },
      ],
      ...overrides,
    });
  }

  it("renders only verified claims and excludes rejected or paid claims", () => {
    render(
      <PaymentQueueTable
        claims={[buildClaim(), buildClaim({ id: "claim-paid", ref: "EXP-0003", status: "paid" }), buildRejectedClaim()]}
        employees={[]}
      />,
    );

    expect(screen.queryByText("EXP-0002")).not.toBeInTheDocument();
    expect(screen.queryByText("EXP-0003")).not.toBeInTheDocument();
    expect(screen.getByText("EXP-0001")).toBeInTheDocument();
  });

  it("never renders the rejection reason or a comment editor for a rejected claim", () => {
    render(
      <PaymentQueueTable
        claims={[buildClaim(), buildRejectedClaim({ comments: "Would-be comment" })]}
        employees={FINANCE_EMPLOYEES}
      />,
    );

    expect(screen.queryByText("Missing itemized receipt")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Comment for EXP-0002" })).not.toBeInTheDocument();
  });
});

describe("PaymentQueueTable renders columns from the shared schema", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders headers in the schema's order with the schema's labels", () => {
    render(<PaymentQueueTable claims={[buildClaim()]} employees={[]} />);

    const labels = screen.getAllByRole("columnheader").map((header) => header.textContent?.trim());
    expect(labels).toEqual([
      "Select all claims",
      ...PAYMENT_QUEUE_COLUMNS.map((column) => column.label),
    ]);
  });

  it("renders a sort toggle only for schema columns with a sortKey", () => {
    render(<PaymentQueueTable claims={[buildClaim()]} employees={[]} />);

    for (const column of PAYMENT_QUEUE_COLUMNS) {
      if (column.sortKey) {
        expect(screen.getByRole("button", { name: column.label })).toBeInTheDocument();
      } else {
        expect(screen.queryByRole("button", { name: column.label })).not.toBeInTheDocument();
      }
    }
  });

  it("spans the empty state across every schema column plus the selection checkbox", () => {
    render(<PaymentQueueTable claims={[]} employees={[]} />);

    expect(screen.getByText("No claims match your search.")).toHaveAttribute(
      "colspan",
      String(PAYMENT_QUEUE_COLUMNS.length + 1),
    );
  });

  it("keeps the responsive visibility classes on the schema columns", () => {
    render(<PaymentQueueTable claims={[buildClaim()]} employees={[]} />);

    const headers = new Map(
      screen.getAllByRole("columnheader").map((header) => [header.textContent?.trim(), header]),
    );
    expect(headers.get("Category")).toHaveClass("hidden", "md:table-cell");
    expect(headers.get("Sub category")).toHaveClass("hidden", "lg:table-cell");
    expect(headers.get("Bill submission")).toHaveClass("hidden", "sm:table-cell");
    expect(headers.get("Bill invoice date")).toHaveClass("hidden", "lg:table-cell");
    expect(headers.get("Amount")).toHaveClass("text-right");
    expect(headers.get("Approved on")).toHaveClass("hidden", "xl:table-cell");
    expect(headers.get("Remark")).toHaveClass("hidden", "xl:table-cell");
    expect(headers.get("Comments")).toHaveClass("min-w-[220px]");
  });

  it("renders row cell content from the schema renderers", () => {
    const claim = buildClaim({
      subCategory: "Team dinner",
      remark: "Approved by manager",
      history: [
        { id: "h-1", kind: "approved", actorId: "employee-2", createdAt: "2026-08-02T10:00:00.000Z" },
      ],
    });
    render(
      <PaymentQueueTable
        claims={[claim]}
        employees={[{ id: "employee-1", organizationId: "org-1", name: "Ada Lovelace", role: null, active: true, managerId: null }]}
      />,
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(claim.title)).toBeInTheDocument();
    expect(screen.getByText(claim.ref)).toBeInTheDocument();
    expect(screen.getByText("Team dinner")).toBeInTheDocument();
    expect(screen.getByText("₹1250.00")).toBeInTheDocument();
    expect(screen.getByText(claim.status)).toBeInTheDocument();
    expect(screen.getByText("2026-08-02")).toBeInTheDocument();
    expect(screen.getByText("Approved by manager")).toBeInTheDocument();
  });
});

describe("PaymentQueueTable Excel export", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    buildAndDownloadXlsxMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function openExportPopover(claims: ExpenseClaim[]) {
    render(<PaymentQueueTable claims={claims} employees={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
  }

  it("renders an Export button in the toolbar", () => {
    render(<PaymentQueueTable claims={[buildClaim()]} employees={[]} />);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("opens a popover with both export actions", () => {
    openExportPopover([buildClaim()]);

    expect(screen.getByRole("button", { name: "Export current view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export full queue" })).toBeInTheDocument();
  });

  it("disables Export current view when the queue is empty", () => {
    openExportPopover([]);

    expect(screen.getByRole("button", { name: "Export current view" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export full queue" })).toBeEnabled();
  });

  it("disables Export current view when filters leave no rows", () => {
    render(
      <PaymentQueueTable
        claims={[buildClaim(), buildClaim({ id: "claim-paid", ref: "EXP-0003", status: "paid" })]}
        employees={[]}
      />,
    );
    // Search query with no match -> empty view.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nonexistent-ref" } });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(screen.getByRole("button", { name: "Export current view" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export full queue" })).toBeEnabled();
  });

  it("exports exactly the filtered and sorted rows for the current view", () => {
    render(
      <PaymentQueueTable
        claims={[
          buildClaim(),
          buildClaim({ id: "claim-2", ref: "EXP-0002", title: "Flight booking" }),
        ]}
        employees={[]}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "EXP-0002" } });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    fireEvent.click(screen.getByRole("button", { name: "Export current view" }));

    expect(buildAndDownloadXlsxMock).toHaveBeenCalledTimes(1);
    const [rows, , scope] = buildAndDownloadXlsxMock.mock.calls[0];
    expect(rows.map((claim) => claim.id)).toEqual(["claim-2"]);
    expect(scope).toBe("current");
  });

  it("exports every claim the queue holds, ignoring filters, for the full queue", () => {
    openExportPopover([
      buildClaim(),
      buildClaim({ id: "claim-2", ref: "EXP-0002" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Export full queue" }));

    expect(buildAndDownloadXlsxMock).toHaveBeenCalledTimes(1);
    const [rows, , scope] = buildAndDownloadXlsxMock.mock.calls[0];
    expect(rows.map((claim) => claim.id)).toEqual(["claim-1", "claim-2"]);
    expect(scope).toBe("full");
  });

  it("exports the full queue even when the filtered view is empty", () => {
    openExportPopover([buildClaim()]);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nonexistent-ref" } });
    fireEvent.click(screen.getByRole("button", { name: "Export full queue" }));

    expect(buildAndDownloadXlsxMock).toHaveBeenCalledTimes(1);
    const [rows] = buildAndDownloadXlsxMock.mock.calls[0];
    expect(rows.map((claim) => claim.id)).toEqual(["claim-1"]);
  });
});

describe("PaymentQueueTable payment register export (ADR-0023)", () => {
  const APPROVED_BANK_DETAILS = {
    employeeId: "employee-1",
    details: {
      holderName: "Ada Lovelace",
      accountNumber: "001234567890",
      ifsc: "HDFC0001234",
      bankName: "HDFC Bank",
      branch: "Indiranagar, Bengaluru",
    },
  };

  beforeEach(() => {
    mockRefresh.mockReset();
    buildAndDownloadPaymentRegisterMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders a select-all checkbox in the header and one per claim row", () => {
    render(<PaymentQueueTable claims={[buildClaim(), buildClaim({ id: "claim-2", ref: "EXP-0002" })]} employees={[]} />);

    expect(screen.getByRole("checkbox", { name: "Select all claims" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select EXP-0001" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select EXP-0002" })).toBeInTheDocument();
  });

  it("disables the register export until at least one claim is selected", () => {
    render(<PaymentQueueTable claims={[buildClaim()]} employees={[]} />);

    const exportButton = screen.getByRole("button", { name: "Export payment register" });
    expect(exportButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    expect(screen.getByRole("button", { name: "Export payment register" })).toBeEnabled();
  });

  it("toggles a row selection on click and lets the header checkbox select every visible row", () => {
    render(
      <PaymentQueueTable
        claims={[buildClaim(), buildClaim({ id: "claim-2", ref: "EXP-0002" })]}
        employees={[]}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    expect(screen.getByRole("checkbox", { name: "Select EXP-0001" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    expect(screen.getByRole("checkbox", { name: "Select EXP-0001" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all claims" }));
    expect(screen.getByRole("checkbox", { name: "Select EXP-0001" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select EXP-0002" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all claims" }));
    expect(screen.getByRole("checkbox", { name: "Select EXP-0001" })).not.toBeChecked();
  });

  it("does not open the expense drawer when toggling a row checkbox", () => {
    render(<PaymentQueueTable claims={[buildClaim()]} employees={[]} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exports exactly the selected claims with their approved bank details", () => {
    render(
      <PaymentQueueTable
        claims={[buildClaim(), buildClaim({ id: "claim-2", ref: "EXP-0002", requesterId: "employee-2" })]}
        employees={[
          { id: "employee-1", organizationId: "org-1", name: "Ada Lovelace", role: null, active: true, managerId: null },
          { id: "employee-2", organizationId: "org-1", name: "Grace Hopper", role: null, active: true, managerId: null },
        ]}
        approvedBankDetails={[
          APPROVED_BANK_DETAILS,
          {
            employeeId: "employee-2",
            details: {
              holderName: "Grace Hopper",
              accountNumber: "9876543210",
              ifsc: "ICIC0004321",
              bankName: "ICICI Bank",
              branch: "Koramangala, Bengaluru",
            },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0002" }));
    fireEvent.click(screen.getByRole("button", { name: "Export payment register" }));

    expect(buildAndDownloadPaymentRegisterMock).toHaveBeenCalledTimes(1);
    const [rows] = buildAndDownloadPaymentRegisterMock.mock.calls[0] as [
      Array<{ expenseId: string; employeeName: string; amount: number; details: unknown }>,
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0].expenseId).toBe("claim-2");
    expect(rows[0].employeeName).toBe("Grace Hopper");
    expect(rows[0].amount).toBe(1250);
    expect(rows[0].details).toMatchObject({ holderName: "Grace Hopper", accountNumber: "9876543210" });
  });

  it("shows a success message when every selected claim is exported", () => {
    render(
      <PaymentQueueTable
        claims={[buildClaim(), buildClaim({ id: "claim-2", ref: "EXP-0002" })]}
        employees={[]}
        approvedBankDetails={[APPROVED_BANK_DETAILS, { ...APPROVED_BANK_DETAILS, employeeId: "employee-1" }]}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all claims" }));
    fireEvent.click(screen.getByRole("button", { name: "Export payment register" }));

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent("Payment register exported for 2 claims.");
  });

  it("reports selected claims skipped for missing approved bank details", () => {
    render(
      <PaymentQueueTable
        claims={[buildClaim(), buildClaim({ id: "claim-2", ref: "EXP-0002", requesterId: "employee-2" })]}
        employees={[]}
        approvedBankDetails={[APPROVED_BANK_DETAILS]}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all claims" }));
    fireEvent.click(screen.getByRole("button", { name: "Export payment register" }));

    expect(buildAndDownloadPaymentRegisterMock).toHaveBeenCalledTimes(1);
    const [rows] = buildAndDownloadPaymentRegisterMock.mock.calls[0];
    expect(rows.map((row: { expenseId: string }) => row.expenseId)).toEqual(["claim-1"]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 selected claim was skipped: approved bank details are missing, so it cannot be paid yet.",
    );
  });

  it("downloads nothing and explains when none of the selection can be exported", () => {
    render(
      <PaymentQueueTable
        claims={[buildClaim({ requesterId: "employee-2" })]}
        employees={[]}
        approvedBankDetails={[]}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    fireEvent.click(screen.getByRole("button", { name: "Export payment register" }));

    expect(buildAndDownloadPaymentRegisterMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "None of the selected claims can be exported: they have no approved bank details yet.",
    );
  });
});

describe("PaymentQueueTable receipt panel is PDF-only", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function buildClaimWithReceipt(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
    return buildClaim({
      attachment: {
        id: "att-1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        storageKey: "org-1/claim-1/att-1.pdf",
        status: "available",
        contentSha256: "abc123",
        sizeBytes: 1234,
        uploadedAt: "2026-08-01T00:00:00.000Z",
      },
      ...overrides,
    });
  }

  it("opens via its own trigger and never renders the journey timeline for a receipt claim", () => {
    render(<PaymentQueueTable claims={[buildClaimWithReceipt()]} employees={[]} />);

    expect(screen.queryByRole("region", { name: "Journey for EXP-0001" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Preview receipt for EXP-0001" }));

    expect(screen.getByRole("button", { name: "Download summary" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Journey for EXP-0001")).not.toBeInTheDocument();
  });

  it("never renders the journey timeline for the no-receipt fallback", () => {
    const withReceipt = buildClaimWithReceipt();
    const withoutReceipt = buildClaim({ id: "claim-2", ref: "EXP-0002" });
    render(<PaymentQueueTable claims={[withReceipt, withoutReceipt]} employees={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview receipt for EXP-0001" }));
    fireEvent.keyDown(screen.getByLabelText("Payment queue, arrow keys move selection, Enter opens claim details"), { key: "ArrowDown" });

    expect(screen.getByText("No receipt attached to this claim.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Journey for EXP-0002")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Journey for EXP-0001")).not.toBeInTheDocument();
  });

  it("does not open the receipt panel merely by clicking the row", () => {
    const { container } = render(<PaymentQueueTable claims={[buildClaimWithReceipt()]} employees={[]} />);

    fireEvent.click(screen.getByText("Client dinner"));

    const panel = container.querySelector('aside[aria-label="Receipt preview"]');
    expect(panel).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PaymentQueueTable row click opens the shared expense drawer", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the expense drawer populated with the clicked row's claim", () => {
    const claim = buildClaim();
    render(
      <PaymentQueueTable
        claims={[claim]}
        employees={FINANCE_EMPLOYEES}
        currentUser="Grace Hopper"
        currentUserId="employee-2"
      />,
    );

    fireEvent.click(screen.getByText("Client dinner"));

    expect(screen.getByRole("heading", { name: "Client dinner" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: `Expense details: ${claim.title}` })).toBeInTheDocument();
  });

  it("keeps the receipt panel's selection open while the drawer, opened from the same row, is closed", () => {
    const claim = buildClaim({
      attachment: {
        id: "att-1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        storageKey: "org-1/claim-1/att-1.pdf",
        status: "available",
        contentSha256: "abc123",
        sizeBytes: 1234,
        uploadedAt: "2026-08-01T00:00:00.000Z",
      },
    });
    render(<PaymentQueueTable claims={[claim]} employees={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview receipt for EXP-0001" }));
    expect(screen.getByRole("button", { name: "Download summary" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Client dinner"));
    expect(screen.getByRole("dialog", { name: `Expense details: ${claim.title}` })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close details"));

    // The panel opened before the drawer and stayed open the whole time,
    // independent of the drawer's own open/close state: closing the drawer
    // never touched the panel's selection.
    expect(screen.getByLabelText("Receipt preview for EXP-0001")).toHaveAttribute("aria-hidden", "false");
  });

  it("does not open the drawer when clicking the row's receipt preview trigger", () => {
    const claim = buildClaim({
      attachment: {
        id: "att-1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        storageKey: "org-1/claim-1/att-1.pdf",
        status: "available",
        contentSha256: "abc123",
        sizeBytes: 1234,
        uploadedAt: "2026-08-01T00:00:00.000Z",
      },
    });
    render(<PaymentQueueTable claims={[claim]} employees={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview receipt for EXP-0001" }));

    expect(screen.queryByRole("heading", { name: "Client dinner" })).not.toBeInTheDocument();
  });

  it("opens the drawer from the keyboard: ArrowDown selects the first row and Enter opens it", () => {
    const claim = buildClaim();
    render(
      <PaymentQueueTable
        claims={[claim]}
        employees={FINANCE_EMPLOYEES}
        currentUser="Grace Hopper"
        currentUserId="employee-2"
      />,
    );

    const region = screen.getByLabelText("Payment queue, arrow keys move selection, Enter opens claim details");
    fireEvent.keyDown(region, { key: "ArrowDown" });
    fireEvent.keyDown(region, { key: "Enter" });

    expect(screen.getByRole("dialog", { name: `Expense details: ${claim.title}` })).toBeInTheDocument();
  });

  it("does not open the drawer on Enter when no row is selected", () => {
    const claim = buildClaim();
    render(<PaymentQueueTable claims={[claim]} employees={[]} />);

    fireEvent.keyDown(screen.getByLabelText("Payment queue, arrow keys move selection, Enter opens claim details"), { key: "Enter" });

    expect(screen.queryByRole("dialog", { name: `Expense details: ${claim.title}` })).not.toBeInTheDocument();
  });
});

describe("PaymentQueueTable download summary in the side panel", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    downloadBlobMock.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function buildClaimWithReceipt(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
    return buildClaim({
      attachment: {
        id: "att-1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        storageKey: "org-1/claim-1/att-1.pdf",
        status: "available",
        contentSha256: "abc123",
        sizeBytes: 1234,
        uploadedAt: "2026-08-01T00:00:00.000Z",
      },
      ...overrides,
    });
  }

  it("opens the panel with a Download summary button for a claim with a receipt", () => {
    render(<PaymentQueueTable claims={[buildClaimWithReceipt()]} employees={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview receipt for EXP-0001" }));

    expect(screen.getByRole("button", { name: "Download summary" })).toBeInTheDocument();
  });

  it("downloads the summary PDF for the selected claim", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(new Uint8Array([37, 80, 68, 70])))));
    render(<PaymentQueueTable claims={[buildClaimWithReceipt()]} employees={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview receipt for EXP-0001" }));
    fireEvent.click(screen.getByRole("button", { name: "Download summary" }));

    await waitFor(() => {
      expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    });
    expect(fetch).toHaveBeenCalledWith("/api/expenses/claim-1/summary");
    expect(downloadBlobMock).toHaveBeenCalledWith(expect.objectContaining({ size: 4 }), "EXP-0001-summary.pdf");
  });

  it("shows the server error banner and saves no file when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Summary unavailable" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    render(<PaymentQueueTable claims={[buildClaimWithReceipt()]} employees={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview receipt for EXP-0001" }));
    fireEvent.click(screen.getByRole("button", { name: "Download summary" }));

    expect(await screen.findByText("Summary unavailable")).toBeInTheDocument();
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });

  it("shows the network error banner and saves no file when the fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<PaymentQueueTable claims={[buildClaimWithReceipt()]} employees={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview receipt for EXP-0001" }));
    fireEvent.click(screen.getByRole("button", { name: "Download summary" }));

    expect(
      await screen.findByText("Could not reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });
});

describe("PaymentQueueTable drag-and-drop table Excel import", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("handles dragging and dropping an Excel file onto the table container to auto-select claims", async () => {
    const claim1 = buildClaim({ id: "claim-1", ref: "EXP-0001" });
    const claim2 = buildClaim({ id: "claim-2", ref: "EXP-0002" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            report: {
              matched: [claim1],
              conflicts: [],
              unknownIds: [],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<PaymentQueueTable claims={[claim1, claim2]} employees={[]} />);

    const tableDropZone = screen.getByTestId("payment-queue-droppable-table");

    // Drag over table shows drag indicators
    fireEvent.dragEnter(tableDropZone, {
      dataTransfer: {
        items: [{ kind: "file", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
      },
    });

    expect(screen.getByText("Drop Excel register to auto-select claims")).toBeInTheDocument();

    const file = new File(["dummy excel bytes"], "payment-register.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Drop onto table
    fireEvent.drop(tableDropZone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("1 matching claim selected.");
    });

    // Verify claim-1 checkbox is checked, claim-2 is unchecked
    const claim1Checkbox = screen.getByRole("checkbox", { name: "Select EXP-0001" });
    const claim2Checkbox = screen.getByRole("checkbox", { name: "Select EXP-0002" });

    expect(claim1Checkbox).toBeChecked();
    expect(claim2Checkbox).not.toBeChecked();
  });
});

describe("PaymentQueueTable bulk payment verification preview", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("displays total amount, claim count, payee names, and bank details in the quick verification preview dialog", () => {
    const claim1 = buildClaim({
      id: "claim-1",
      ref: "EXP-0001",
      title: "Team lunch",
      amountMinor: 250000,
      requesterId: "employee-1",
    });
    const claim2 = buildClaim({
      id: "claim-2",
      ref: "EXP-0002",
      title: "Software license",
      amountMinor: 125000,
      requesterId: "employee-2",
    });

    render(
      <PaymentQueueTable
        claims={[claim1, claim2]}
        employees={FINANCE_EMPLOYEES}
        approvedBankDetails={[
          {
            employeeId: "employee-1",
            details: {
              accountHolderName: "Ada Lovelace",
              accountNumber: "1234567890",
              ifscCode: "HDFC0001234",
              bankName: "HDFC Bank",
              branchName: "Koramangala",
            },
          },
        ]}
      />,
    );

    // Select all claims
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all claims" }));

    // Click "Mark selected paid" button
    const markSelectedBtn = screen.getByRole("button", { name: "Mark selected paid" });
    fireEvent.click(markSelectedBtn);

    // Verify dialog title and description
    const dialog = screen.getByRole("dialog");
    const inDialog = within(dialog);

    expect(
      inDialog.getByRole("heading", { name: "Verify and mark 2 claims as paid" }),
    ).toBeInTheDocument();
    expect(
      inDialog.getByText("Review the itemized amounts and payee bank details before confirming bulk payout."),
    ).toBeInTheDocument();

    // Verify prominent total payout amount (2500 + 1250 = 3750)
    expect(inDialog.getByText("Total Payout Amount")).toBeInTheDocument();
    expect(inDialog.getByText("2 claims selected")).toBeInTheDocument();

    // Verify itemized rows in preview breakdown
    expect(inDialog.getByText("Team lunch")).toBeInTheDocument();
    expect(inDialog.getByText("Software license")).toBeInTheDocument();
    expect(inDialog.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(inDialog.getByText("Grace Hopper")).toBeInTheDocument();
    expect(inDialog.getByText(/HDFC Bank ••7890/)).toBeInTheDocument();
    expect(inDialog.getByText("No bank details")).toBeInTheDocument();

    // Verify confirmation button with formatted total
    expect(
      inDialog.getByRole("button", { name: /Confirm payment/ }),
    ).toBeInTheDocument();
  });

  it("executes payment on confirmation and shows execution report", async () => {
    const claim1 = buildClaim({ id: "claim-1", ref: "EXP-0001", amountMinor: 100000 });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            report: {
              paid: [claim1],
              skipped: [],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(<PaymentQueueTable claims={[claim1]} employees={[]} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select EXP-0001" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark selected paid" }));

    const confirmBtn = screen.getByRole("button", { name: /Confirm payment/ });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/finance/payment-register/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimIds: ["claim-1"] }),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("1 claim marked paid.");
    });
  });
});
