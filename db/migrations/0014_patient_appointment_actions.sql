CREATE TABLE IF NOT EXISTS patient_appointment_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('cancel', 'reschedule')),
  stage text NOT NULL CHECK (stage IN (
    'select_appointment', 'confirm_cancel', 'select_slot', 'confirm_reschedule'
  )),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  offered_appointments jsonb NOT NULL DEFAULT '[]'::jsonb,
  offered_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_starts_at timestamptz,
  outcome text CHECK (outcome IN ('completed', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '20 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((outcome IS NULL) = (completed_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS patient_appointment_actions_open_conversation_unique
  ON patient_appointment_actions (tenant_id, conversation_id)
  WHERE outcome IS NULL;

CREATE INDEX IF NOT EXISTS patient_appointment_actions_patient_idx
  ON patient_appointment_actions (tenant_id, patient_id, created_at DESC);

ALTER TABLE patient_appointment_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON patient_appointment_actions;
CREATE POLICY tenant_isolation ON patient_appointment_actions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
