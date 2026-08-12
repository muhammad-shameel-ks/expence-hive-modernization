// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkImport } from "./bulk-import";

const CSV =
  "name,email,role,department,manager\nGrace Hopper,grace@hive.local,executive,Engineering,\n";

function renderImport(overrides: {
  onImported?: (employees: unknown[]) => void;
  onMessage?: (message: string) => void;
  onError?: (error: string) => void;
} = {}) {
  const onImported = vi.fn();
  const onMessage = vi.fn();
  const onError = vi.fn();
  render(
    <BulkImport
      onImported={overrides.onImported ?? onImported}
      onMessage={overrides.onMessage ?? onMessage}
      onError={overrides.onError ?? onError}
    />,
  );
  return { onImported, onMessage, onError };
}

async function pickFile(csv: string, fileName = "roster.csv") {
  const file = new File([csv], fileName, { type: "text/csv" });
  const input = screen.getByLabelText("CSV file") as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BulkImport", () => {
  it("uploads a picked file and reports the created rows", async () => {
    const { onImported, onMessage } = renderImport();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        result: {
          total: 1,
          created: [
            {
              rowNumber: 2,
              email: "grace@hive.local",
              status: "created",
              employee: {
                id: "emp-grace",
                organizationId: "org-1",
                name: "Grace Hopper",
                email: "grace@hive.local",
                department: "Engineering",
                departmentId: "dept-1",
                role: null,
                active: true,
                managerId: "emp-ada",
              },
            },
          ],
          failed: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await pickFile(CSV);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import roster" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/employees/import",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ csv: CSV }),
      }),
    );
    expect(onImported).toHaveBeenCalledWith([
      expect.objectContaining({ id: "emp-grace", name: "Grace Hopper" }),
    ]);
    expect(onMessage).toHaveBeenCalledWith("Imported 1 people from roster.csv.");
    expect(screen.getByText("1 rows imported.")).toBeInTheDocument();
  });

  it("shows per-row failures and imports nothing", async () => {
    const { onImported } = renderImport();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: "validation",
        result: {
          total: 1,
          created: [],
          failed: [
            {
              rowNumber: 2,
              email: "grace@hive.local",
              status: "failed",
              error: 'Unknown role "no-such-role"',
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await pickFile(CSV);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import roster" }));
    });

    expect(onImported).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing was imported");
    expect(screen.getByRole("alert")).toHaveTextContent("Row 2 (grace@hive.local)");
    expect(screen.getByRole("alert")).toHaveTextContent('Unknown role "no-such-role"');
  });

  it("stays disabled until a file is picked", () => {
    renderImport();

    expect(screen.getByRole("button", { name: "Import roster" })).toBeDisabled();
  });

  it("maps an unauthorized response to the Superadmin-only message", async () => {
    const { onError } = renderImport();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "unauthorized" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await pickFile(CSV);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import roster" }));
    });

    expect(onError).toHaveBeenCalledWith("Only Superadmin can import users.");
  });
});
