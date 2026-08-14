import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetCurrentEmployee, mockRedirect, mockCookieGet, mockGetWorkspace } = vi.hoisted(() => ({
  mockGetCurrentEmployee: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  mockCookieGet: vi.fn(),
  mockGetWorkspace: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mockCookieGet }),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/server/auth/dev", () => ({
  devAuth: () => ({ getCurrentEmployee: mockGetCurrentEmployee }),
}));

vi.mock("@/server/expenses/dev", () => ({
  expenseCommands: () => ({ getWorkspace: mockGetWorkspace }),
}));

import { ExpenseError } from "@/server/expenses/commands";
import { getWorkspaceOrRedirect, requireSessionEmployee } from "./session";

describe("requireSessionEmployee", () => {
  beforeEach(() => {
    mockGetCurrentEmployee.mockReset();
    mockRedirect.mockClear();
    mockCookieGet.mockReset();
  });

  it("returns the employee for a valid session cookie", async () => {
    mockCookieGet.mockReturnValue({ value: "session-1" });
    const employee = { id: "emp-1", organizationId: "org-1" };
    mockGetCurrentEmployee.mockReturnValue(employee);

    await expect(requireSessionEmployee()).resolves.toBe(employee);
    expect(mockGetCurrentEmployee).toHaveBeenCalledWith("session-1");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);

    await expect(requireSessionEmployee()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockGetCurrentEmployee).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the session does not resolve to an employee", async () => {
    mockCookieGet.mockReturnValue({ value: "session-stale" });
    mockGetCurrentEmployee.mockReturnValue(null);

    await expect(requireSessionEmployee()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});

describe("getWorkspaceOrRedirect", () => {
  beforeEach(() => {
    mockGetWorkspace.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the workspace for an authorized employee", async () => {
    const workspace = { employee: { id: "emp-1" }, employees: [], claims: [] };
    mockGetWorkspace.mockResolvedValue(workspace);

    await expect(getWorkspaceOrRedirect("emp-1")).resolves.toBe(workspace);
    expect(mockGetWorkspace).toHaveBeenCalledWith("emp-1");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /login when the employee is unauthorized", async () => {
    mockGetWorkspace.mockRejectedValue(new ExpenseError("unauthorized", "deactivated"));

    await expect(getWorkspaceOrRedirect("emp-1")).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("rethrows non-unauthorized errors", async () => {
    mockGetWorkspace.mockRejectedValue(new ExpenseError("not-found", "missing"));

    await expect(getWorkspaceOrRedirect("emp-1")).rejects.toThrow("missing");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
