ALTER TABLE voice_sessions
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS patient_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS voice_sessions_conversation_idx
  ON voice_sessions (tenant_id, conversation_id)
  WHERE conversation_id IS NOT NULL;
