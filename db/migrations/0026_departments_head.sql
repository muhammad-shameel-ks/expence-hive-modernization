-- Departments require a head (ADR-0019). head_id is a nullable FK so
-- existing departments stay valid; the requirement to have a head at
-- creation time is enforced by the command layer, not a hard DB
-- constraint.

ALTER TABLE departments ADD COLUMN head_id TEXT REFERENCES employees(id);
