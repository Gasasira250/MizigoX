DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM (
    'ACTIVE',
    'AVAILABLE',
    'ASSIGNED',
    'IN_TRANSIT',
    'MAINTENANCE',
    'INACTIVE',
    'RETIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_availability AS ENUM (
    'AVAILABLE',
    'UNAVAILABLE',
    'ASSIGNED',
    'ON_TRIP',
    'MAINTENANCE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fuel_type AS ENUM (
    'DIESEL',
    'PETROL',
    'ELECTRIC',
    'HYBRID',
    'CNG',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ownership_type AS ENUM (
    'OWNED',
    'LEASED',
    'SUBCONTRACTED',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payload_unit AS ENUM ('KG', 'T');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE driver_status AS ENUM (
    'ACTIVE',
    'AVAILABLE',
    'ASSIGNED',
    'ON_TRIP',
    'OFF_DUTY',
    'SUSPENDED',
    'INACTIVE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE driver_availability AS ENUM (
    'AVAILABLE',
    'UNAVAILABLE',
    'ASSIGNED',
    'ON_TRIP',
    'OFF_DUTY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_document_type AS ENUM (
    'REGISTRATION',
    'INSURANCE',
    'INSPECTION',
    'ROADWORTHINESS',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE driver_document_type AS ENUM (
    'LICENSE',
    'IDENTITY',
    'MEDICAL',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fleet_document_status AS ENUM (
    'VALID',
    'PENDING',
    'REVOKED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS vehicle_types (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO vehicle_types (code, name, sort_order) VALUES
  ('MOTORCYCLE', 'Motorcycle', 10),
  ('SEDAN', 'Sedan', 20),
  ('PICKUP', 'Pickup', 30),
  ('VAN', 'Van', 40),
  ('LIGHT_TRUCK', 'Light truck', 50),
  ('MEDIUM_TRUCK', 'Medium truck', 60),
  ('HEAVY_TRUCK', 'Heavy truck', 70),
  ('TRACTOR_HEAD', 'Tractor head', 80),
  ('TRAILER', 'Trailer', 90),
  ('REFRIGERATED_TRUCK', 'Refrigerated truck', 100),
  ('OTHER', 'Other', 110)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

CREATE TABLE IF NOT EXISTS vehicle_reference_counters (
  country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (country_code, year)
);

CREATE TABLE IF NOT EXISTS driver_reference_counters (
  country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (country_code, year)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  vehicle_type_code TEXT NOT NULL REFERENCES vehicle_types(code),
  registration_number TEXT NOT NULL,
  registration_normalized TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER CHECK (year IS NULL OR (year >= 1980 AND year <= 2100)),
  color TEXT,
  vin TEXT,
  engine_number TEXT,
  payload_capacity NUMERIC(12, 3) CHECK (payload_capacity IS NULL OR payload_capacity >= 0),
  payload_unit payload_unit NOT NULL DEFAULT 'KG',
  length_m NUMERIC(8, 2) CHECK (length_m IS NULL OR length_m >= 0),
  width_m NUMERIC(8, 2) CHECK (width_m IS NULL OR width_m >= 0),
  height_m NUMERIC(8, 2) CHECK (height_m IS NULL OR height_m >= 0),
  fuel_type fuel_type,
  ownership_type ownership_type NOT NULL DEFAULT 'OWNED',
  status vehicle_status NOT NULL DEFAULT 'ACTIVE',
  availability vehicle_availability NOT NULL DEFAULT 'UNAVAILABLE',
  notes TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_org_registration_unique
  ON vehicles (organization_id, registration_normalized)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicles_organization_idx
  ON vehicles (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicles_status_idx
  ON vehicles (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicles_availability_idx
  ON vehicles (availability)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicles_type_idx
  ON vehicles (vehicle_type_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicles_reference_search_idx
  ON vehicles (lower(reference));

CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  email TEXT,
  date_of_birth DATE,
  license_number TEXT,
  license_category TEXT,
  license_issued_at DATE,
  license_expires_at DATE,
  nationality_country_code VARCHAR(2) REFERENCES countries(code),
  emergency_contact_name TEXT,
  emergency_contact_phone_e164 TEXT,
  status driver_status NOT NULL DEFAULT 'ACTIVE',
  availability driver_availability NOT NULL DEFAULT 'UNAVAILABLE',
  notes TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT drivers_license_dates_check
    CHECK (
      license_issued_at IS NULL
      OR license_expires_at IS NULL
      OR license_expires_at >= license_issued_at
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_unique
  ON drivers (user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS drivers_organization_idx
  ON drivers (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS drivers_status_idx
  ON drivers (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS drivers_availability_idx
  ON drivers (availability)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS drivers_license_expiry_idx
  ON drivers (license_expires_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS drivers_reference_search_idx
  ON drivers (lower(reference));

CREATE TABLE IF NOT EXISTS vehicle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  document_type vehicle_document_type NOT NULL,
  document_number TEXT,
  issued_at DATE,
  expires_at DATE,
  status fleet_document_status NOT NULL DEFAULT 'VALID',
  storage_provider TEXT NOT NULL DEFAULT 'pending',
  storage_key TEXT,
  file_url TEXT,
  notes TEXT,
  uploaded_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT vehicle_documents_dates_check
    CHECK (issued_at IS NULL OR expires_at IS NULL OR expires_at >= issued_at)
);

CREATE INDEX IF NOT EXISTS vehicle_documents_vehicle_idx
  ON vehicle_documents (vehicle_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicle_documents_org_idx
  ON vehicle_documents (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicle_documents_expiry_idx
  ON vehicle_documents (expires_at)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  document_type driver_document_type NOT NULL,
  document_number TEXT,
  issued_at DATE,
  expires_at DATE,
  status fleet_document_status NOT NULL DEFAULT 'VALID',
  storage_provider TEXT NOT NULL DEFAULT 'pending',
  storage_key TEXT,
  file_url TEXT,
  notes TEXT,
  uploaded_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT driver_documents_dates_check
    CHECK (issued_at IS NULL OR expires_at IS NULL OR expires_at >= issued_at)
);

CREATE INDEX IF NOT EXISTS driver_documents_driver_idx
  ON driver_documents (driver_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS driver_documents_org_idx
  ON driver_documents (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS driver_documents_expiry_idx
  ON driver_documents (expires_at)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS vehicle_types_set_updated_at ON vehicle_types;
CREATE TRIGGER vehicle_types_set_updated_at
  BEFORE UPDATE ON vehicle_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS vehicles_set_updated_at ON vehicles;
CREATE TRIGGER vehicles_set_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS drivers_set_updated_at ON drivers;
CREATE TRIGGER drivers_set_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS vehicle_documents_set_updated_at ON vehicle_documents;
CREATE TRIGGER vehicle_documents_set_updated_at
  BEFORE UPDATE ON vehicle_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS driver_documents_set_updated_at ON driver_documents;
CREATE TRIGGER driver_documents_set_updated_at
  BEFORE UPDATE ON driver_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
