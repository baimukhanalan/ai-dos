-- Реальная привязка учётной записи врача и одноразовые приглашения сотрудников.
ALTER TABLE users
  ADD CONSTRAINT users_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE doctors
  ADD CONSTRAINT doctors_tenant_id_id_unique UNIQUE (tenant_id, id);

CREATE TABLE IF NOT EXISTS doctor_user_links (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  UNIQUE (tenant_id, doctor_id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, doctor_id)
    REFERENCES doctors(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role_code text NOT NULL CHECK (role_code IN ('operator', 'doctor')),
  doctor_id uuid,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (role_code = 'doctor' AND doctor_id IS NOT NULL)
    OR (role_code = 'operator' AND doctor_id IS NULL)
  ),
  FOREIGN KEY (tenant_id, doctor_id)
    REFERENCES doctors(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, invited_by)
    REFERENCES users(tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_active_email_unique
  ON staff_invitations (tenant_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_invitations_tenant_created_idx
  ON staff_invitations (tenant_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS schedule_exceptions_exact_unique
  ON schedule_exceptions (
    tenant_id, doctor_id, exception_date,
    COALESCE(starts_at, '00:00'::time), COALESCE(ends_at, '24:00'::time)
  );

INSERT INTO roles (tenant_id, code, name, system)
SELECT t.id, seed.code, seed.name, true
FROM tenants t
CROSS JOIN (VALUES
  ('operator', 'Регистратор'),
  ('doctor', 'Врач')
) AS seed(code, name)
ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, system = true;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY (
  CASE r.code
    WHEN 'operator' THEN ARRAY[
      'patients.read', 'patients.write', 'schedule.read',
      'appointments.write', 'conversations.read', 'conversations.write'
    ]::text[]
    WHEN 'doctor' THEN ARRAY['schedule.read', 'appointments.write']::text[]
    ELSE ARRAY[]::text[]
  END
)
WHERE r.code IN ('operator', 'doctor')
ON CONFLICT DO NOTHING;

ALTER TABLE doctor_user_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON doctor_user_links;
CREATE POLICY tenant_isolation ON doctor_user_links
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation ON staff_invitations;
CREATE POLICY tenant_isolation ON staff_invitations
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

INSERT INTO schema_migrations (version) VALUES ('0016_staff_doctor_access')
ON CONFLICT (version) DO NOTHING;
