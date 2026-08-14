-- Наблюдения внешней регистратуры хранятся отдельно от внутренних правил и
-- записей AI Dos. UI-парсер не может молча переписать источник правды.

CREATE TABLE IF NOT EXISTS external_schedule_observations (
  id uuid PRIMARY KEY,
  capture_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('damumed')),
  doctor_id uuid NOT NULL,
  schedule_date date NOT NULL,
  observed_at timestamptz NOT NULL,
  source_url text NOT NULL,
  free_count integer NOT NULL DEFAULT 0 CHECK (free_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, doctor_id)
    REFERENCES doctors(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, provider, doctor_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS external_schedule_observation_doctor_idx
  ON external_schedule_observations (tenant_id, doctor_id, schedule_date, observed_at DESC);
CREATE INDEX IF NOT EXISTS external_schedule_observation_capture_idx
  ON external_schedule_observations (capture_id);

CREATE TABLE IF NOT EXISTS external_schedule_slots (
  id uuid PRIMARY KEY,
  observation_id uuid NOT NULL REFERENCES external_schedule_observations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('available', 'booked', 'break', 'unknown')),
  observed_at timestamptz NOT NULL,
  FOREIGN KEY (tenant_id, doctor_id)
    REFERENCES doctors(tenant_id, id) ON DELETE CASCADE,
  CHECK (ends_at > starts_at),
  UNIQUE (observation_id, starts_at)
);

CREATE INDEX IF NOT EXISTS external_schedule_slot_observation_idx
  ON external_schedule_slots (observation_id);
CREATE INDEX IF NOT EXISTS external_schedule_slot_available_idx
  ON external_schedule_slots (tenant_id, doctor_id, starts_at)
  WHERE status = 'available';

ALTER TABLE external_schedule_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_schedule_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON external_schedule_observations;
CREATE POLICY tenant_isolation ON external_schedule_observations
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON external_schedule_slots;
CREATE POLICY tenant_isolation ON external_schedule_slots
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

INSERT INTO schema_migrations (version) VALUES ('0023_external_schedule_observations')
ON CONFLICT (version) DO NOTHING;
