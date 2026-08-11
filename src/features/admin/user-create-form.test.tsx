// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminDepartment, AdminEmployee, AdminRole } from "@/server/admin/ports";
import { UserCreateForm } from "./user-create-form";

const ROLES: AdminRole[] = [
  {
    id: "role-executive",
    organizationId: "org-1",
    code: "executive",
    displayName: "Executive",
    departmentId: null,
    active: true,
    locked: true,
  },
];

const DEPARTMENTS: AdminDepartment[] = [
  {
    id: "dept-engineering",
    organizationId: "org-1",
    name: "Engineering",
    active: true,
    headId: "emp-ada",
    head: { id: "emp-ada", name: "Ada Lovelace" },
  },
  {
    id: "dept-headless",
    organizationId: "org-1",
    name: "Legacy",
    active: true,
    headId: null,
    head: null,
  },
];

const PEOPLE: AdminEmployee[] = [
  {
    id: "emp-ada",
    organizationId: "org-1",
    name: "Ada Lovelace",
    email: "ada@hive.local",
    department: "Engineering",
    departmentId: "dept-engineering",
    role: { id: "role-manager", code: "manager", displayName: "Manager" },
    active: true,
    managerId: null,
  },
  {
    id: "emp-grace",
    organizationId: "org-1",
    name: "Grace Hopper",
    email: "grace@hive.local",
    department: "Engineering",
    departmentId: "dept-engineering",
    role: null,
    active: true,
    managerId: null,
  },
];

function renderForm(overrides: {
  onCreated?: (employee: AdminEmployee) => void;
  onMessage?: (message: string) => void;
  onError?: (error: string) => void;
} = {}) {
  const onCreated = vi.fn();
  const onMessage = vi.fn();
  const onError = vi.fn();
  render(
    <UserCreateForm
      people={PEOPLE}
      roles={ROLES}
      departments={DEPARTMENTS}
      onCreated={overrides.onCreated ?? onCreated}
      onMessage={overrides.onMessage ?? onMessage}
      onError={overrides.onError ?? onError}
    />,
  );
  return { onCreated, onMessage, onError };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UserCreateForm", () => {
  it("auto-fills the manager from the department head when a department is picked", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Katherine Johnson" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "katherine@hive.local" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "role-executive" },
    });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-engineering" },
    });

    expect(screen.getByLabelText("Manager")).toHaveValue("emp-ada");
    expect(
      screen.getByText(/Defaults to the Engineering department head \(Ada Lovelace\)/),
    ).toBeInTheDocument();
  });

  it("keeps a manual manager override when the department changes afterwards", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-engineering" },
    });
    fireEvent.change(screen.getByLabelText("Manager"), {
      target: { value: "emp-grace" },
    });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-headless" },
    });

    expect(screen.getByLabelText("Manager")).toHaveValue("emp-grace");
  });

  it("clears the manager when a headless department is picked", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-engineering" },
    });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-headless" },
    });

    expect(screen.getByLabelText("Manager")).toHaveValue("");
    expect(
      screen.getByText(/has no head yet - choose a manager manually/),
    ).toBeInTheDocument();
  });

  it("submits the form with the auto-defaulted manager", async () => {
    const { onCreated, onMessage } = renderForm();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        employee: {
          id: "emp-katherine",
          organizationId: "org-1",
          name: "Katherine Johnson",
          email: "katherine@hive.local",
          department: "Engineering",
          departmentId: "dept-engineering",
          role: { id: "role-executive", code: "executive", displayName: "Executive" },
          active: true,
          managerId: "emp-ada",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Katherine Johnson" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "katherine@hive.local" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "role-executive" },
    });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-engineering" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/employees",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Katherine Johnson",
          email: "katherine@hive.local",
          roleId: "role-executive",
          departmentId: "dept-engineering",
          managerId: "emp-ada",
        }),
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "emp-katherine", managerId: "emp-ada" }),
    );
    expect(onMessage).toHaveBeenCalledWith("Katherine Johnson created with the Executive role.");
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(""));
  });

  it("shows an error message when the server rejects the creation", async () => {
    const { onError } = renderForm();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "validation" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Katherine Johnson" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "katherine@hive.local" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "role-executive" },
    });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-engineering" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    });

    expect(onError).toHaveBeenCalledWith(
      "The user could not be created. Check the form details and try again.",
    );
  });

  it("maps an unauthorized response to the Superadmin-only message", async () => {
    const { onError } = renderForm();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "unauthorized" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Katherine Johnson" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "katherine@hive.local" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "role-executive" },
    });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-engineering" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    });

    expect(onError).toHaveBeenCalledWith("Only Superadmin can create users.");
  });

  it("disables the submit button until every field is filled", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Create user" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Katherine Johnson" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "katherine@hive.local" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "role-executive" },
    });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "dept-engineering" },
    });

    expect(screen.getByRole("button", { name: "Create user" })).toBeEnabled();
  });
});
