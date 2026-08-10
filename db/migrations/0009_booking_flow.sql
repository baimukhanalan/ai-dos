-- Разговорная запись: AI ведёт диалог до записи и фиксирует ИСХОД каждой попытки.
-- Раньше причины потерянного спроса выводились из соседних таблиц (неявки,
-- отказы, истёкшие предложения) и были оценкой. Здесь исход пишется в момент,
-- когда он произошёл, поэтому «почему не записались» становится фактом.
CREATE TABLE IF NOT EXISTS booking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'web'
    CHECK (channel IN ('web', 'phone', 'whatsapp', 'telegram', 'portal', 'mcp')),
  language text NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'kk', 'en')),
  -- Шаг диалога: кого записываем → на какое время → подтверждение → закрыт.
  stage text NOT NULL DEFAULT 'need_doctor'
    CHECK (stage IN ('need_doctor', 'need_slot', 'confirming', 'done')),
  doctor_id uuid REFERENCES doctors(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  -- Слоты, реально показанные пациенту: по ним считается выбор и «время не подошло».
  offered_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_starts_at timestamptz,
  -- Ходов диалога без продвижения: два подряд — честная передача или закрытие.
  misses integer NOT NULL DEFAULT 0,
  turns integer NOT NULL DEFAULT 0,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  outcome text CHECK (outcome IN ('booked', 'lost', 'escalated')),
  lost_reason text CHECK (lost_reason IN (
    'no_slot', 'price', 'no_doctor', 'changed_mind', 'wrong_time',
    'needs_human', 'identity_unverified', 'abandoned'
  )),
  outcome_note text,
  -- Цена услуги на момент исхода: потерянная выручка считается по факту,
  -- а не по средней цене прайса.
  value_kzt integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  -- Причина потери существует ровно тогда, когда исход — потеря.
  CHECK ((outcome = 'lost') = (lost_reason IS NOT NULL)),
  CHECK ((outcome IS NULL) = (closed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS booking_sessions_outcome_idx
  ON booking_sessions (tenant_id, outcome, closed_at DESC);
CREATE INDEX IF NOT EXISTS booking_sessions_open_idx
  ON booking_sessions (tenant_id, updated_at) WHERE outcome IS NULL;

-- Один открытый диалог записи на пациента: продолжаем начатое, а не плодим сессии.
CREATE UNIQUE INDEX IF NOT EXISTS booking_sessions_open_patient_unique
  ON booking_sessions (tenant_id, patient_id)
  WHERE outcome IS NULL AND patient_id IS NOT NULL;

ALTER TABLE booking_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON booking_sessions;
CREATE POLICY tenant_isolation ON booking_sessions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

INSERT INTO schema_migrations (version) VALUES ('0009_booking_flow')
ON CONFLICT (version) DO NOTHING;
