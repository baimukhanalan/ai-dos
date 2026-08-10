-- Urgent Booking Engine: когда свободного времени нет, AI не заканчивает
-- разговор отказом, а спрашивает пациента и передаёт запрос администратору с
-- решением APPROVE / OFFER / DECLINE. Это автоматизация частой ручной практики
-- клиник — «вписать вне графика», — а не новая сущность поверх старых.

-- Диалог записи может ждать решения человека, оставаясь открытым.
ALTER TABLE booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_stage_check;
ALTER TABLE booking_sessions
  ADD CONSTRAINT booking_sessions_stage_check
  CHECK (stage IN (
    'need_doctor', 'need_slot', 'urgent_ask', 'confirming', 'awaiting_urgent', 'done'
  ));

ALTER TABLE booking_sessions
  ADD COLUMN IF NOT EXISTS urgent_request_id uuid REFERENCES urgent_requests(id) ON DELETE SET NULL;

-- Обратная связь: администратор видит, из какого разговора пришёл запрос,
-- и какое время он в итоге предложил или подтвердил.
ALTER TABLE urgent_requests
  ADD COLUMN IF NOT EXISTS booking_session_id uuid REFERENCES booking_sessions(id) ON DELETE SET NULL;
ALTER TABLE urgent_requests
  ADD COLUMN IF NOT EXISTS proposed_starts_at timestamptz;
ALTER TABLE urgent_requests
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS urgent_requests_pending_idx
  ON urgent_requests (tenant_id, requested_at DESC) WHERE status = 'pending';

INSERT INTO schema_migrations (version) VALUES ('0010_urgent_booking')
ON CONFLICT (version) DO NOTHING;
