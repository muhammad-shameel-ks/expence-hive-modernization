-- Company-wide absence auto-skip setting (ADR-0018): a single value per
-- organization, configurable by Superadmin in the admin panel and enforced
-- by the scheduled sweep worker plus the lazy read-path catch-up. Existing
-- organizations default to the previous hardcoded 3-day timeout; the check
-- keeps the stored value a sane whole number of days (the command layer
-- validates the same bounds before writing).

CREATE TABLE organization_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  absence_timeout_days INTEGER NOT NULL DEFAULT 3 CHECK (absence_timeout_days BETWEEN 1 AND 90)
);
