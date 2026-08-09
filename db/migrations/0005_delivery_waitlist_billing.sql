-- Доставка уведомлений: состояние повторов, локаль, дедупликация и адресат.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'ru';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key text;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled', 'blocked'));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_unique
  ON notifications (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_dispatch_idx
  ON notifications (next_attempt_at) WHERE status = 'queued';

-- Предложения из листа ожидания: слот, срок жизни и связанная запись.
ALTER TABLE waitlist_offers ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL;
ALTER TABLE waitlist_offers ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE waitlist_offers ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30;
ALTER TABLE waitlist_offers ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE waitlist_offers ADD COLUMN IF NOT EXISTS notification_id uuid REFERENCES notifications(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_offers_active_unique
  ON waitlist_offers (waitlist_entry_id) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS waitlist_offers_expiry_idx
  ON waitlist_offers (expires_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS waitlist_entries_matching_idx
  ON waitlist_entries (tenant_id, priority, created_at) WHERE status = 'waiting';

-- Скан незакрытых визитов для воркера no-show.
CREATE INDEX IF NOT EXISTS appointments_no_show_scan_idx
  ON appointments (ends_at) WHERE status = 'confirmed';

-- Подписка: платёжный контур владельца остаётся внешним, поэтому фиксируем только намерение.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_email text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'manual';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'invoice_pending';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS usage_counters_period_idx ON usage_counters (tenant_id, period_start DESC);

INSERT INTO permissions (code, description) VALUES
  ('billing.write', 'Изменение тарифа клиники'),
  ('branding.write', 'Настройка бренда клиники'),
  ('notifications.retry', 'Повтор доставки уведомлений')
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0005_delivery_waitlist_billing')
ON CONFLICT (version) DO NOTHING;
