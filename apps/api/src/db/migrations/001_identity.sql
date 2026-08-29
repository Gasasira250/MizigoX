CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE currencies (
  code VARCHAR(3) PRIMARY KEY CHECK (char_length(code) = 3),
  name TEXT NOT NULL,
  decimal_places SMALLINT NOT NULL CHECK (decimal_places >= 0 AND decimal_places <= 4),
  symbol TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE countries (
  code VARCHAR(2) PRIMARY KEY CHECK (char_length(code) = 2),
  iso3 VARCHAR(3) NOT NULL UNIQUE CHECK (char_length(iso3) = 3),
  name TEXT NOT NULL,
  phone_country_code TEXT NOT NULL,
  default_timezone TEXT NOT NULL,
  default_currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  address_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE organization_type AS ENUM ('PLATFORM', 'OPERATOR', 'CUSTOMER');
CREATE TYPE organization_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED');
CREATE TYPE role_scope AS ENUM ('PLATFORM', 'OPERATOR', 'CUSTOMER');
CREATE TYPE membership_status AS ENUM ('ACTIVE', 'INVITED', 'REVOKED');

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type organization_type NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  registration_number TEXT,
  tax_id TEXT,
  country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  default_currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  email TEXT,
  phone_e164 TEXT,
  status organization_status NOT NULL DEFAULT 'ACTIVE',
  parent_organization_id UUID REFERENCES organizations(id),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  phone_e164 TEXT,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  preferred_timezone TEXT NOT NULL DEFAULT 'Africa/Kigali',
  status user_status NOT NULL DEFAULT 'ACTIVE',
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX users_email_active_idx ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_phone_active_idx ON users (phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  scope role_scope NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  status membership_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before JSONB,
  after JSONB,
  ip TEXT,
  user_agent TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
