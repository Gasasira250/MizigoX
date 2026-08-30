ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS organizations_type_idx
  ON organizations (type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS organizations_parent_idx
  ON organizations (parent_organization_id)
  WHERE parent_organization_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS organizations_country_idx
  ON organizations (country_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON organization_memberships (user_id);

CREATE INDEX IF NOT EXISTS organization_memberships_role_idx
  ON organization_memberships (role_id);

CREATE INDEX IF NOT EXISTS users_status_idx
  ON users (status)
  WHERE deleted_at IS NULL;

CREATE TABLE user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  email TEXT NOT NULL,
  invited_by_user_id UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_invites_pending_email_org_idx
  ON user_invites (organization_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX user_invites_org_idx ON user_invites (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS organizations_set_updated_at ON organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS organization_memberships_set_updated_at ON organization_memberships;
CREATE TRIGGER organization_memberships_set_updated_at
  BEFORE UPDATE ON organization_memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_invites_set_updated_at ON user_invites;
CREATE TRIGGER user_invites_set_updated_at
  BEFORE UPDATE ON user_invites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
