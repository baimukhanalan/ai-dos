CREATE TABLE IF NOT EXISTS phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  e164 text NOT NULL,
  label text NOT NULL DEFAULT 'Основная линия',
  provider text NOT NULL DEFAULT 'sip' CHECK (provider IN ('sip', 'twilio', 'zadarma', 'binotel', 'asterisk', 'other')),
  provider_reference text,
  voice text NOT NULL DEFAULT 'marin',
  greeting text,
  languages text[] NOT NULL DEFAULT ARRAY['kk','ru','en']::text[],
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (e164)
);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id uuid REFERENCES phone_numbers(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  external_call_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number text,
  to_number text,
  language text,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'human_handoff', 'completed', 'failed', 'rejected', 'missed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  outcome text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_call_id)
);

CREATE INDEX IF NOT EXISTS calls_tenant_started_idx ON calls (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS calls_tenant_status_idx ON calls (tenant_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  storage_provider text NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  duration_seconds integer,
  bytes bigint,
  consent_recorded_at timestamptz NOT NULL,
  encryption_key_reference text,
  retention_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, storage_key)
);

CREATE TABLE IF NOT EXISTS voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'openai_realtime',
  model text NOT NULL,
  voice text NOT NULL,
  requested_language text NOT NULL DEFAULT 'auto',
  detected_language text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'connected', 'completed', 'failed')),
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS voice_sessions_tenant_started_idx ON voice_sessions (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS staff_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_tasks_tenant_status_idx ON staff_tasks (tenant_id, status, due_at);

CREATE TABLE IF NOT EXISTS urgent_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'alternative_offered', 'closed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text
);

CREATE TABLE IF NOT EXISTS waitlist_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  waitlist_entry_id uuid NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'declined', 'expired', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  locale text NOT NULL DEFAULT 'ru',
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, locale, channel, version)
);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  provider text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  status text NOT NULL,
  provider_reference text,
  error_code text,
  duration_ms integer,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, attempt)
);

CREATE TABLE IF NOT EXISTS scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_kind text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  active_version integer,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS scenario_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  version integer NOT NULL,
  graph jsonb NOT NULL,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, version)
);

CREATE TABLE IF NOT EXISTS scenario_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  scenario_version integer NOT NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'handed_off')),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text NOT NULL,
  channel text NOT NULL,
  locale text NOT NULL DEFAULT 'ru',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  frequency_cap_days integer NOT NULL DEFAULT 30 CHECK (frequency_cap_days > 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'opted_out', 'skipped_no_consent')),
  provider_reference text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, patient_id)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_code text
);

CREATE TABLE IF NOT EXISTS feature_flags (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS preferred_channel text NOT NULL DEFAULT 'phone';
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'phone_numbers','calls','call_recordings','voice_sessions','staff_tasks','urgent_requests',
    'waitlist_offers','notification_templates','delivery_attempts','scenarios','scenario_versions',
    'scenario_executions','campaigns','campaign_contacts','webhook_events','feature_flags'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;

INSERT INTO permissions (code, description) VALUES
  ('calls.read', 'Просмотр звонков'),
  ('calls.takeover', 'Перехват и перевод звонков'),
  ('calls.recordings.read', 'Прослушивание записей звонков'),
  ('waitlist.write', 'Управление листом ожидания'),
  ('callbacks.write', 'Управление обратными звонками'),
  ('tasks.write', 'Управление задачами'),
  ('urgent_requests.write', 'Решение срочных запросов'),
  ('staff.write', 'Управление сотрудниками'),
  ('scenarios.publish', 'Публикация разговорных сценариев'),
  ('campaigns.write', 'Управление исходящими кампаниями'),
  ('notifications.write', 'Управление уведомлениями'),
  ('integrations.write', 'Управление интеграциями'),
  ('telephony.write', 'Управление телефонией'),
  ('audit.read', 'Просмотр журнала аудита'),
  ('billing.read', 'Просмотр тарифа и использования'),
  ('exports.create', 'Экспорт данных')
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0004_voice_and_platform_modules')
ON CONFLICT (version) DO NOTHING;
