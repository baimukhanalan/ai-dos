ALTER TABLE voice_sessions
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS next_action text;

COMMENT ON COLUMN voice_sessions.summary IS
  'Краткое безопасное резюме голосового разговора для сотрудника клиники.';

COMMENT ON COLUMN voice_sessions.next_action IS
  'Следующий операционный шаг после голосового разговора.';
