-- Отдельный контур доступа владельца SaaS-платформы.
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  result text NOT NULL DEFAULT 'success',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_created_idx
  ON platform_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_resource_idx
  ON platform_audit_events (resource_type, resource_id, created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('0017_platform_admin')
ON CONFLICT (version) DO NOTHING;
