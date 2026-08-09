-- Состояние переноса записи во внешнюю МИС. Источник правды остаётся в AI Dos:
-- пациенту подтверждают запись из собственной базы, а МИС догоняет фоном.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS external_sync_state text NOT NULL DEFAULT 'pending';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS external_sync_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS external_sync_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS external_sync_error text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS external_sync_next_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_external_sync_state_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_external_sync_state_check
  CHECK (external_sync_state IN ('pending', 'syncing', 'synced', 'failed', 'not_required'));

-- Записи, созданные до появления синхронизации, переносить некуда.
UPDATE appointments SET external_sync_state = 'not_required'
WHERE external_sync_state = 'pending' AND created_at < now();

CREATE INDEX IF NOT EXISTS appointments_sync_pending_idx
  ON appointments (external_sync_next_at)
  WHERE external_sync_state IN ('pending', 'syncing');

INSERT INTO permissions (code, description) VALUES
  ('mis.sync.retry', 'Повтор переноса записи в МИС')
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0006_mis_sync')
ON CONFLICT (version) DO NOTHING;
