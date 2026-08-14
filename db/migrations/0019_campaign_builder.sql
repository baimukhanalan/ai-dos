ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'recall';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS message_body text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Almaty';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_window_start time NOT NULL DEFAULT '09:00';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_window_end time NOT NULL DEFAULT '18:00';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS daily_limit integer NOT NULL DEFAULT 200;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS period_days integer NOT NULL DEFAULT 4;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_contacts integer NOT NULL DEFAULT 1000;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS results jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stopped_at timestamptz;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_delivery_limits_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_delivery_limits_check CHECK (
  daily_limit BETWEEN 1 AND 10000 AND period_days BETWEEN 1 AND 90
  AND max_contacts BETWEEN 1 AND 100000 AND send_window_end > send_window_start
);

ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS notification_id uuid REFERENCES notifications(id) ON DELETE SET NULL;
ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS exclusion_reason text;
ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE campaign_contacts DROP CONSTRAINT IF EXISTS campaign_contacts_status_check;
ALTER TABLE campaign_contacts ADD CONSTRAINT campaign_contacts_status_check CHECK (
  status IN ('queued', 'sent', 'delivered', 'failed', 'blocked', 'cancelled',
    'opted_out', 'skipped_no_consent', 'skipped_frequency', 'skipped_duplicate',
    'skipped_missing_channel')
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_contacts_notification_unique
  ON campaign_contacts (notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_contacts_campaign_status_idx
  ON campaign_contacts (tenant_id, campaign_id, status);
CREATE INDEX IF NOT EXISTS campaigns_due_idx
  ON campaigns (scheduled_at) WHERE status IN ('scheduled', 'running');

INSERT INTO permissions (code, description) VALUES
  ('campaigns.read', 'Просмотр исходящих кампаний'),
  ('campaigns.publish', 'Запуск и остановка исходящих кампаний')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('campaigns.read', 'campaigns.write', 'campaigns.publish')
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0019_campaign_builder')
ON CONFLICT (version) DO NOTHING;
