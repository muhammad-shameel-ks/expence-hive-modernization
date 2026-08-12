# ADR-0015: Per-Role Privilege Toggles

Status: accepted.

## Context

Role authority is currently hardcoded in `CAPABILITIES_BY_ROLE_CODE` (`src/server/shared/authorization.ts`): five locked predefined roles (Intern, Executive, Manager, Finance Head, Finance Executive) plus the built-in Superadmin identity that is not assignable as a role.
Custom roles exist in the admin store but resolve to submit-only.
The role-management revamp requires the administrator to control what each role can do, including the new hold capability, and to create custom roles with meaningful privileges.

## Decision

1. **Capabilities become role data, not code keys.** Each role record (predefined and custom) carries its own privilege set, resolved from the store instead of the hardcoded map.
   The `resolveRoleCapabilities`-style resolution reads the role record; unknown or absent roles get submit-only as the safe default.
2. **The privilege catalog is fixed at six toggles:** submit claims, approve/reject, finance verify/pay (queue access), hold claims, view org-wide activity, access the admin console.
   No other privileges exist as toggles.
3. **Superadmin is not a toggleable role.** It remains the built-in console owner with every privilege.
   Two powers are Superadmin-only built-ins and never appear in the toggle catalog: **delegation** (ADR-0017) and **company auto-skip configuration** (ADR-0018).
4. **The five predefined roles are editable:** the administrator may change their privilege toggles.
   Locked status continues to mean "cannot be deleted", not "cannot be edited".
5. **Custom roles are created with a name and a privilege set** and participate in the flow editor like predefined roles.
6. **Removing a privilege mid-flight is governed:** if a role loses `approve` (or another action privilege) while claims are pending at that role's steps, the admin is warned with the full list of affected claims before confirming, and those pending steps auto-skip to the next level on the next absence sweep (ADR-0018).
7. Client-side capability mirrors (`next-action.ts` and friends) are updated from the same role data so UI and server never disagree.

## Consequences

The authorization surface is no longer a compile-time map; server commands, the admin console, the drawer, and the dashboard all resolve capabilities from the role record.
The locked-role tests in `authorization.test.ts` are rewritten around role data.
A role whose `approve` toggle is removed cannot be assigned fresh approval work, and its pending work is swept forward rather than stranded.

## Revisit When

If a future meeting wants delegation or company settings to be grantable beyond Superadmin, the catalog changes and the two built-ins move into the toggle set.
