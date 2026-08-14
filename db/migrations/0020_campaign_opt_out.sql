CREATE TABLE IF NOT EXISTS campaign_opt_out_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_opt_out_active_idx
  ON campaign_opt_out_tokens (token_hash, expires_at) WHERE used_at IS NULL;

ALTER TABLE campaign_opt_out_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON campaign_opt_out_tokens;
CREATE POLICY tenant_isolation ON campaign_opt_out_tokens
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

INSERT INTO schema_migrations (version) VALUES ('0020_campaign_opt_out')
ON CONFLICT (version) DO NOTHING;
