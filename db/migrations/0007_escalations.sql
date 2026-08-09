-- Полноценная передача пациента человеку: не просто «позвать оператора», а
-- готовая карточка — сводка разговора, распознанный intent, причина эскалации,
-- уже предпринятые действия и минимальный контекст пациента. Оператор
-- продолжает с этой точки, а не с «чем могу помочь».
CREATE TABLE IF NOT EXISTS escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'web',
  intent text NOT NULL DEFAULT 'other',
  reason text NOT NULL CHECK (reason IN (
    'emergency', 'complaint', 'human_request', 'sensitive_data',
    'no_slot', 'out_of_scope', 'identity_unverified', 'other'
  )),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  summary text NOT NULL,
  -- [{ action, result }] — что AI уже сделал до передачи.
  attempted_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Минимальный контекст: имя, маскированный телефон, язык. Без ИИН и диагнозов.
  patient_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'resolved', 'dismissed')),
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text,
  resolved_at timestamptz,
  -- Дедупликация: один открытый эскейл на разговор.
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escalations_tenant_status_idx
  ON escalations (tenant_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS escalations_open_dedupe_idx
  ON escalations (tenant_id, dedupe_key) WHERE status IN ('open', 'claimed') AND dedupe_key IS NOT NULL;

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON escalations;
CREATE POLICY tenant_isolation ON escalations
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

INSERT INTO permissions (code, description) VALUES
  ('escalations.read', 'Просмотр эскалаций'),
  ('escalations.write', 'Разбор эскалаций'),
  ('analytics.read', 'Просмотр аналитики и выручки')
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0007_escalations')
ON CONFLICT (version) DO NOTHING;
