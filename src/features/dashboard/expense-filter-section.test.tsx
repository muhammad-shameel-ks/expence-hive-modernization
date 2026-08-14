// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseFilterSection } from "./expense-filter-section";
import { expenses, type Expense } from "./mock-data";

const mockReplace = vi.fn();
let mockPathname = "/expenses/all";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  );
}

function renderSection(list: Expense[], mobile = false) {
  stubMatchMedia(mobile);
  return render(
    <ExpenseFilterSection expenses={list}>
      {({ rows, hasActiveFilters, sort, onSort }) => (
        <div>
          <ul aria-label="results">
            {rows.map((e) => (
              <li key={e.id}>{e.title}</li>
            ))}
          </ul>
          <p aria-label="filter-state">
            {hasActiveFilters ? "filtered" : "preview"} sort={sort.key}
          </p>
          <button type="button" onClick={() => onSort("amount")}>
            sort by amount
          </button>
        </div>
      )}
    </ExpenseFilterSection>,
  );
}

function resultTitles() {
  const list = screen.getByRole("list", { name: "results" });
  return within(list).queryAllByRole("listitem").map((li) => li.textContent);
}

function chip(name: RegExp | string) {
  const group = screen.getByRole("group", { name: "Filter by status" });
  return within(group).getByRole("button", { name });
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPathname = "/expenses/all";
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  mockReplace.mockClear();
  vi.unstubAllGlobals();
});

describe("ExpenseFilterSection quick chips", () => {
  it("renders one chip per status in STATUS_META order plus All (ADR-0021)", () => {
    renderSection(expenses);
    const chips = within(screen.getByRole("group", { name: "Filter by status" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent?.replace(/\d+/g, "").trim())).toEqual([
      "All",
      "Draft",
      "Submitted",
      "In approval",
      "Approved",
      "In finance",
      "Paid",
      "Rejected",
    ]);
  });

  it("starts with All pressed and every row shown", () => {
    renderSection(expenses);
    expect(chip(/^All/)).toHaveAttribute("aria-pressed", "true");
    expect(chip(/^Paid/)).toHaveAttribute("aria-pressed", "false");
    expect(resultTitles()).toHaveLength(expenses.length);
  });

  it("filters to exactly the chosen status when a chip is pressed", () => {
    renderSection(expenses);
    fireEvent.click(chip(/^Paid/));
    const titles = resultTitles();
    expect(titles).toHaveLength(4);
    for (const title of ["Office snacks — pantry restock", "Taxi — airport pickup", "Team building — go-karting", "Domain renewal — hive.local"]) {
      expect(titles).toContain(title);
    }
  });

  it("makes approved and rejected reachable (ADR-0021)", () => {
    renderSection(expenses);
    fireEvent.click(chip(/^Approved/));
    expect(resultTitles()).toEqual(["Hotel — Karachi office week"]);
    fireEvent.click(chip(/^Rejected/));
    expect(resultTitles().sort()).toEqual(["Client dinner — Acme Corp", "USB-C hub + cables"].sort());
  });

  it("shows per-chip counts from the source list", () => {
    renderSection(expenses);
    expect(chip(/^Paid/).textContent).toMatch(/4/);
    expect(chip(/^Rejected/).textContent).toMatch(/2/);
    expect(chip(/^All/).textContent).toMatch(new RegExp(String(expenses.length)));
  });

  it("returns to All when the All chip is pressed again", () => {
    renderSection(expenses);
    fireEvent.click(chip(/^Rejected/));
    fireEvent.click(chip(/^All/));
    expect(resultTitles()).toHaveLength(expenses.length);
    expect(chip(/^All/)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ExpenseFilterSection URL sync (ADR-0021)", () => {
  it("writes the chip to the query string", async () => {
    renderSection(expenses);
    fireEvent.click(chip(/^Rejected/));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/expenses/all?status=rejected", { scroll: false }));
  });

  it("preserves unrelated params when rewriting the URL", async () => {
    mockSearchParams = new URLSearchParams("claim=ex-1");
    renderSection(expenses);
    fireEvent.click(chip(/^Paid/));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/expenses/all?claim=ex-1&status=paid", { scroll: false }),
    );
  });

  it("hydrates the chip, search, advanced filters, and sort from the URL", () => {
    mockSearchParams = new URLSearchParams(
      "q=figma&status=approved&cats=Software&min=50&max=500&from=2026-08-01&to=2026-08-31&sort=amount&dir=asc",
    );
    renderSection(expenses);
    expect(chip(/^Approved/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/sort=amount/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));
    expect(screen.getByRole("searchbox", { name: "Search expenses" })).toHaveValue("figma");
    expect(screen.getByLabelText("Minimum amount")).toHaveValue(50);
    expect(screen.getByLabelText("Maximum amount")).toHaveValue(500);
    expect(screen.getByLabelText("Submitted from date")).toHaveValue("2026-08-01");
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("amount-asc");
  });

  it("lets the status multi-select win over the chip on a stale URL", () => {
    mockSearchParams = new URLSearchParams("status=approved&statuses=paid,rejected");
    renderSection(expenses);
    expect(chip(/^Approved/)).toHaveAttribute("aria-pressed", "false");
    expect(chip(/^All/)).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));
    expect(screen.getByRole("checkbox", { name: "Paid" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Rejected" })).toBeChecked();
    expect(resultTitles()).toHaveLength(6);
  });

  it("does not rewrite the URL on mount with identical params", () => {
    mockSearchParams = new URLSearchParams("status=paid");
    renderSection(expenses);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("re-applies URL state after back/forward navigation", async () => {
    const { rerender } = renderSection(expenses);
    mockSearchParams = new URLSearchParams("status=rejected");
    rerender(
      <ExpenseFilterSection expenses={expenses}>
        {({ rows }) => (
          <ul aria-label="results">
            {rows.map((e) => (
              <li key={e.id}>{e.title}</li>
            ))}
          </ul>
        )}
      </ExpenseFilterSection>,
    );
    await waitFor(() => expect(chip(/^Rejected/)).toHaveAttribute("aria-pressed", "true"));
    expect(resultTitles().sort()).toEqual(["Client dinner — Acme Corp", "USB-C hub + cables"].sort());
  });

  it("round-trips combined chip and advanced state through the URL", async () => {
    renderSection(expenses);
    fireEvent.click(chip(/^In finance/));
    fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search expenses" }), {
      target: { value: "figma" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Software" }));
    fireEvent.change(screen.getByLabelText("Minimum amount"), { target: { value: "500" } });
    await waitFor(() =>
      expect(mockReplace.mock.calls.at(-1)?.[0]).toBe(
        "/expenses/all?q=figma&status=in-finance&cats=Software&min=500",
      ),
    );
    expect(resultTitles()).toEqual(["Figma Professional plan — H2 renewal"]);
  });
});

describe("ExpenseFilterSection advanced layer", () => {
  it("layers search, category, amount, and date on top of a chip", () => {
    renderSection(expenses);
    fireEvent.click(chip(/^In finance/));
    fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));

    fireEvent.change(screen.getByRole("searchbox", { name: "Search expenses" }), {
      target: { value: "figma" },
    });
    expect(resultTitles()).toEqual(["Figma Professional plan — H2 renewal"]);

    fireEvent.change(screen.getByLabelText("Minimum amount"), { target: { value: "600" } });
    expect(resultTitles()).toEqual([]);

    fireEvent.change(screen.getByLabelText("Minimum amount"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Submitted from date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Submitted to date"), { target: { value: "2026-08-31" } });
    expect(resultTitles()).toEqual(["Figma Professional plan — H2 renewal"]);
  });

  it("lets grouped intents stay expressible through the status multi-select", () => {
    renderSection(expenses);
    fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));
    // The old "In progress" group: submitted + in-approval + approved + in-finance.
    for (const label of ["Submitted", "In approval", "Approved", "In finance"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: label }));
    }
    expect(resultTitles()).toHaveLength(5);
    expect(resultTitles()).toContain("Figma Professional plan — H2 renewal");
    expect(resultTitles()).not.toContain("Office snacks — pantry restock");
  });

  it("extends the active chip when a status checkbox is checked, then shows All", async () => {
    renderSection(expenses);
    fireEvent.click(chip(/^Approved/));
    fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "In finance" }));
    expect(chip(/^Approved/)).toHaveAttribute("aria-pressed", "false");
    // The multi-select now represents the statuses, so no single chip is pressed.
    expect(chip(/^All/)).toHaveAttribute("aria-pressed", "false");
    expect(resultTitles().sort()).toEqual(["Figma Professional plan — H2 renewal", "Hotel — Karachi office week"].sort());
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/expenses/all?statuses=approved%2Cin-finance", { scroll: false }),
    );
  });

  it("clears every advanced filter with Clear filters but keeps the sort", async () => {
    renderSection(expenses);
    fireEvent.click(chip(/^In finance/));
    fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search expenses" }), {
      target: { value: "figma" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "amount-asc" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(resultTitles()).toHaveLength(expenses.length);
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("amount-asc");
    expect(screen.getByText(/sort=amount/)).toBeInTheDocument();
  });

  it("sorts by amount highest first from the advanced layer", () => {
    renderSection(expenses);
    fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "amount-desc" } });
    expect(resultTitles()[0]).toBe("Hotel — Karachi office week");
  });

  it("exposes the column sort to the table header, toggling direction on the same column", () => {
    renderSection(expenses);
    fireEvent.click(screen.getByRole("button", { name: "sort by amount" }));
    const desc = resultTitles();
    expect(desc[0]).toBe("Hotel — Karachi office week");
    fireEvent.click(screen.getByRole("button", { name: "sort by amount" }));
    const asc = resultTitles();
    expect(asc[asc.length - 1]).toBe("Hotel — Karachi office week");
  });
});

describe("ExpenseFilterSection mobile collapse", () => {
  it("collapses to a Filters affordance below the sm breakpoint", () => {
    renderSection(expenses, true);
    expect(screen.getByRole("button", { name: /^Filters/ })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter by status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^More filters/ })).not.toBeInTheDocument();
  });

  it("shows the active filter count on the collapsed affordance", () => {
    mockSearchParams = new URLSearchParams("status=paid");
    renderSection(expenses, true);
    expect(screen.getByRole("button", { name: /^Filters 1/ })).toBeInTheDocument();
  });

  it("expands chips, search, and the advanced layer inline when opened", () => {
    renderSection(expenses, true);
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search expenses" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Rejected" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toBeInTheDocument();
  });

  it("filters from the mobile panel and keeps the URL in sync", async () => {
    renderSection(expenses, true);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Paid/ }));
    expect(resultTitles()).toHaveLength(4);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/expenses/all?status=paid", { scroll: false }));
  });
});

describe("ExpenseFilterSection surface contract", () => {
  it("reports hasActiveFilters to the surface for the dashboard's preview truncation", () => {
    renderSection(expenses);
    expect(screen.getByLabelText("filter-state").textContent).toContain("preview");
    fireEvent.click(chip(/^Paid/));
    expect(screen.getByLabelText("filter-state").textContent).toContain("filtered");
  });
});
