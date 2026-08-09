-- Intent Engine: сохраняем распознанный запрос пациента на входящем сообщении,
-- чтобы видеть реальное распределение обращений (что именно спрашивают).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS intent text;
CREATE INDEX IF NOT EXISTS messages_tenant_intent_idx
  ON messages (tenant_id, created_at DESC) WHERE intent IS NOT NULL;

-- Структурированный слой знаний клиники: не один system-prompt на 50k строк,
-- а адресные правила, которые AI достаёт под конкретное обращение.
-- category: scheduling | preparation | policy | insurance | pricing | exception | general
-- scope: clinic | doctor | service (scope_ref указывает на конкретную сущность)
CREATE TABLE IF NOT EXISTS knowledge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'scheduling', 'preparation', 'policy', 'insurance', 'pricing', 'exception', 'general'
  )),
  scope text NOT NULL DEFAULT 'clinic' CHECK (scope IN ('clinic', 'doctor', 'service')),
  scope_ref uuid,
  locale text NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'kk', 'en')),
  title text NOT NULL,
  body text NOT NULL,
  -- Ключевые слова-триггеры для адресного поиска правила.
  keywords text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_rules_lookup_idx
  ON knowledge_rules (tenant_id, category, status);

ALTER TABLE knowledge_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON knowledge_rules;
CREATE POLICY tenant_isolation ON knowledge_rules
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

INSERT INTO permissions (code, description) VALUES
  ('knowledge_rules.write', 'Управление правилами клиники')
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0008_intent_identity_knowledge')
ON CONFLICT (version) DO NOTHING;
