-- Неизменяемые опубликованные версии и optimistic concurrency для редактора сценариев.
ALTER TABLE scenario_versions
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS change_summary text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO permissions (code, description) VALUES
  ('scenarios.read', 'Просмотр разговорных сценариев'),
  ('scenarios.write', 'Редактирование разговорных сценариев')
ON CONFLICT (code) DO NOTHING;

-- Clinic Owner/Admin управляет сценарием по умолчанию. Остальным ролям права
-- выдаются отдельно в матрице доступа клиники.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'clinic_admin'
  AND p.code IN ('scenarios.read', 'scenarios.write', 'scenarios.publish')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS scenario_versions_tenant_scenario_idx
  ON scenario_versions (tenant_id, scenario_id, version DESC);

INSERT INTO schema_migrations (version) VALUES ('0018_scenario_builder')
ON CONFLICT (version) DO NOTHING;
