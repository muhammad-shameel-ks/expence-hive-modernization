-- Employees get an explicit active state so the console can deactivate
-- departed staff (blocking future sign-in) and reactivate returnees
-- without data loss. Existing rows default to active.

ALTER TABLE employees ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
