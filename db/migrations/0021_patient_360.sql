ALTER TABLE patient_consents
  ADD COLUMN IF NOT EXISTS text_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS patient_consents_tenant_patient_purpose_recorded_idx
  ON patient_consents (tenant_id, patient_id, purpose, recorded_at DESC);

INSERT INTO permissions (code, description) VALUES
  ('patients.timeline.read', 'Просмотр единой истории пациента'),
  ('patients.consents.write', 'Фиксация и отзыв согласий пациента')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('patients.timeline.read', 'patients.consents.write')
WHERE r.code IN ('clinic_admin', 'operator')
ON CONFLICT DO NOTHING;
