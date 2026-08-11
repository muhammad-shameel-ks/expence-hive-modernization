# ADR-0019: Admin User Creation and Department Heads

Status: accepted.

## Context

People currently enter the system only through seeded dev identities and first-sign-in provisioning (`src/server/auth/provisioning.ts`); the admin console can assign role, department, and manager but cannot create people.
The hierarchy that drives team-lead flow steps comes from per-person `hierarchy_assignments`, with no notion of a department-level manager.
The company wants the administrator to create users directly, and asked whether a new employee's manager could be derived from their department.

## Decision

1. **The department creation flow changes: a department requires a manager (head).**
   Creating a department means assigning its head; the head is stored on the department and remains editable in department management.
2. **A new employee's manager is always their department's head at creation time.**
   The manager field is read-only in the creation form - the department head is not a suggestion the admin can override at creation - and a headless department blocks submission until the admin assigns it a head in department management. The manager can still be changed afterward via the existing manager assignment.
3. **The admin user-creation flow includes:** name, email, role (predefined or custom, ADR-0015), department, with the manager field locked to the department head.
4. **Bulk import is part of the flow:** a CSV roster creates many users in one action, with the same defaults (manager from department head) and row-level validation feedback.
5. **Created users are pre-provisioned records:** the employee simply signs in with company identity and is picked up; no invitation email is sent. Existing first-sign-in provisioning and created records must not duplicate.
6. Existing departments without a head are surfaced in department management as incomplete and must be assigned one before new members can rely on the default.

## Consequences

The department store gains a head reference; `createEmployee`-based flows and the admin people section gain create + bulk-import UI.
Provisioning must be reconciled with pre-created records (match on identity, never overwrite admin-set assignments).
Org-tree and team-lead step resolution continue to use the hierarchy, which now has a department-head default as its source.

## Revisit When

If the company wants invitation emails or approval before activation, the pre-created flow gains an invitation step; until then, records are active immediately.
