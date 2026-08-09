ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'patient_conversation';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_surface_check'
      AND conrelid = 'messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_surface_check
      CHECK (surface IN ('patient_conversation', 'operator_assistant'));
  END IF;
END $$;

UPDATE patients
SET phone = CASE
  WHEN phone LIKE '+%' THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
  ELSE regexp_replace(phone, '[^0-9]', '', 'g')
END
WHERE phone IS NOT NULL;

UPDATE callback_requests
SET phone = CASE
  WHEN phone LIKE '+%' THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
  ELSE regexp_replace(phone, '[^0-9]', '', 'g')
END;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_appointment_template_unique
  ON notifications (appointment_id, template_code)
  WHERE appointment_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('0003_production_hardening')
ON CONFLICT (version) DO NOTHING;
