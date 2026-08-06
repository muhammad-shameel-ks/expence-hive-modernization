-- Locked predefined roles (intern, executive, manager, finance-head,
-- finance-executive) and the built-in superadmin role must never be
-- deactivated or edited through the console. Custom roles are created
-- with locked = false.

ALTER TABLE roles ADD COLUMN locked boolean NOT NULL DEFAULT false;
