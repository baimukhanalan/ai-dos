CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  identifier text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_no_overlap'
      AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_no_overlap
      EXCLUDE USING gist (
        tenant_id WITH =,
        doctor_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (status IN ('held', 'confirmed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS callback_requests_phone_recent_idx
  ON callback_requests (tenant_id, phone, created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('0002_scheduling_and_rate_limits')
ON CONFLICT (version) DO NOTHING;
