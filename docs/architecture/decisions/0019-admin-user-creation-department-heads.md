# ADR-0019: Admin User Creation and Department Heads

Status: accepted.

## Context

People currently enter the system only through seeded dev identities and first-sign-in provisioning (`src/server/auth/provisioning.ts`); the admin console can assign role, department, and manager but cannot create people.
The hierarchy that drives team-lead flow steps comes from per-person `hierarchy_assignments`, with no notion of a department-level manager.
The company wants the administrator to create users directly, and asked whether a new employee's manager could be derived from their department.

## Decision

1. **The department creation flow changes: a department requires a manager (head).**
   Creating a department means assigning its head; the head is stored on the department and remains editable in department management.
2. **A new employee's manager is always their department's head at creation time - with one documented exception.**
   The manager field is read-only in the single-user creation form - the department head is not a suggestion the admin can override there - and a headless department blocks submission until the admin assigns it a head in department management. The manager can still be changed afterward via the existing manager assignment. The bulk-import CSV (point 4) is the one path that accepts an explicit per-row manager override, since a roster import is the practical place to seed a hierarchy that is not yet department-uniform; an empty manager cell still defaults to the department head.
3. **The admin user-creation flow includes:** name, email, role (predefined or custom, ADR-0015), department, with the manager field locked to the department head.
4. **Bulk import is part of the flow:** a CSV roster creates many users in one action, defaulting manager to the department head with row-level validation feedback, and an optional per-row manager column to override that default (point 2).
5. **Created users are pre-provisioned records:** the employee simply signs in with company identity and is picked up; no invitation email is sent. Existing first-sign-in provisioning and created records must not duplicate.
6. Existing departments without a head are surfaced in department management as incomplete and must be assigned one before new members can rely on the default.
7. **A Manager placed into a headless department auto-promotes to its head.** Both the role-assignment and department-assignment commands (`assignRole`, `assignDepartment`) set a Manager as department head when the department has none; the promotion is immediate, never replaces an existing head, and is not a separate audited action - it lands under the assignment audit event that caused it. This is a convenience on top of point 6: the incomplete surface and the headless submission block still stand for departments that never receive a Manager, and a department management head assignment overrides the default.

## Consequences

The department store gains a head reference; `createEmployee`-based flows and the admin people section gain create + bulk-import UI.
Provisioning must be reconciled with pre-created records (match on identity, never overwrite admin-set assignments).
Org-tree and team-lead step resolution continue to use the hierarchy, which now has a department-head default as its source.

## Revisit When

If the company wants invitation emails or approval before activation, the pre-created flow gains an invitation step; until then, records are active immediately.
