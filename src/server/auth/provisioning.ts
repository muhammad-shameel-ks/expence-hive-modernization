import type { AdminStore } from "../admin/ports";
import type { Employee, IdentityProvider, Provisioner } from "./ports";

// The dev provisioning implementation: an unknown email becomes an employee
// record with the organization's default role (the seeded Executive role in
// the dev wiring). The Superadmin console is where the role changes later;
// nothing here ever rewrites an existing assignment. A future Entra/Graph
// adapter implements the same Provisioner seam and may return profile
// attributes as suggestions, but application-managed data stays
// authoritative.
export function createDevProvisioner({
  adminStore,
  identityProvider,
  organizationId,
  defaultRoleCode,
  nameFromEmail = displayNameFromEmail,
}: {
  adminStore: AdminStore;
  identityProvider: IdentityProvider;
  organizationId: string;
  defaultRoleCode: string;
  nameFromEmail?: (email: string) => string;
}): Provisioner {
  return {
    async provision(email): Promise<Employee | null> {
      const normalized = email.trim().toLowerCase();
      const existing = identityProvider.findByEmail(normalized);
      if (existing) {
        return existing;
      }

      const roles = await adminStore.listRoles(organizationId);
      const defaultRole = roles.find((role) => role.code === defaultRoleCode);
      if (!defaultRole) {
        throw new Error(
          `The default provisioning role "${defaultRoleCode}" does not exist in the organization.`,
        );
      }

      const id = `emp-${crypto.randomUUID().slice(0, 8)}`;
      const name = nameFromEmail(normalized);
      await adminStore.createEmployee(organizationId, { id, name, email: normalized });
      await adminStore.setEmployeeRole(id, defaultRole.id);
      const employee: Employee = { id, email: normalized, name };
      identityProvider.register(employee);
      return employee;
    },
  };
}

// A plain display name derived from the email local part: title-cased with
// dots turned into spaces (john.doe@x.com becomes "John Doe"). No role is
// embedded - the role lives on the assignment, not in the name.
function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(".")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
