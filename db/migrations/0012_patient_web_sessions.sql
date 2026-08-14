CREATE TABLE IF NOT EXISTS patient_web_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  locale text NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'kk', 'en')),
  verified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '6 hours',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS patient_web_sessions_tenant_expiry_idx
  ON patient_web_sessions (tenant_id, expires_at);

ALTER TABLE patient_web_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON patient_web_sessions;
CREATE POLICY tenant_isolation ON patient_web_sessions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
