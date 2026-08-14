-- Полный операционный контур владельца SaaS. Эти таблицы доступны только
-- через requirePlatformAdmin; клинические роли не имеют маршрутов к ним.

CREATE TABLE IF NOT EXISTS platform_payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_kzt integer NOT NULL CHECK (amount_kzt >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'waived')),
  provider text NOT NULL DEFAULT 'manual',
  external_reference text,
  note text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS platform_payment_tenant_period_idx
  ON platform_payment_records (tenant_id, period_start DESC);
CREATE INDEX IF NOT EXISTS platform_payment_pending_idx
  ON platform_payment_records (created_at DESC)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS platform_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'billing', 'integration', 'telephony', 'incident')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  description text,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS platform_support_tenant_updated_idx
  ON platform_support_tickets (tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS platform_support_open_idx
  ON platform_support_tickets (priority, updated_at DESC)
  WHERE status IN ('open', 'in_progress');

CREATE TABLE IF NOT EXISTS tenant_limit_overrides (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN (
    'appointments_created', 'notifications_sent', 'voice_minutes', 'ai_messages'
  )),
  limit_value bigint CHECK (limit_value IS NULL OR limit_value >= 0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, metric)
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES
  ('operations', '{"maintenanceMode":false,"supportEmail":null,"defaultLocale":"ru-KZ","defaultTimezone":"Asia/Almaty"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0022_platform_operations')
ON CONFLICT (version) DO NOTHING;
