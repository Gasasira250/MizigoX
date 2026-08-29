CREATE TABLE customer_profiles (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id),
  preferred_operator_organization_id UUID REFERENCES organizations(id),
  account_manager_user_id UUID REFERENCES users(id),
  credit_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (credit_terms_days >= 0),
  billing_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone_e164 TEXT,
  job_title TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX contacts_organization_idx
  ON contacts (organization_id)
  WHERE deleted_at IS NULL;

CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  label TEXT,
  country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  admin_area_1 TEXT,
  admin_area_2 TEXT,
  locality TEXT,
  sub_locality TEXT,
  street_line1 TEXT,
  street_line2 TEXT,
  postal_code TEXT,
  landmark TEXT,
  formatted_address TEXT NOT NULL,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX addresses_organization_idx
  ON addresses (organization_id)
  WHERE deleted_at IS NULL;

CREATE TYPE shipment_status AS ENUM (
  'DRAFT',
  'BOOKED',
  'ASSIGNED',
  'PICKUP_IN_PROGRESS',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'EXCEPTION'
);

CREATE TABLE shipment_reference_counters (
  country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (country_code, year)
);

CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  customer_organization_id UUID NOT NULL REFERENCES organizations(id),
  operator_organization_id UUID NOT NULL REFERENCES organizations(id),
  booked_by_user_id UUID REFERENCES users(id),
  status shipment_status NOT NULL DEFAULT 'BOOKED',
  cargo_description TEXT,
  cargo_type TEXT,
  weight_kg NUMERIC(12, 3),
  volume_m3 NUMERIC(12, 4),
  pieces_count INTEGER CHECK (pieces_count IS NULL OR pieces_count >= 0),
  special_instructions TEXT,
  origin_address_id UUID REFERENCES addresses(id),
  destination_address_id UUID REFERENCES addresses(id),
  origin_country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  destination_country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  estimated_pickup_at TIMESTAMPTZ,
  estimated_delivery_at TIMESTAMPTZ,
  actual_pickup_at TIMESTAMPTZ,
  actual_delivery_at TIMESTAMPTZ,
  declared_value NUMERIC(19, 4),
  declared_currency_code VARCHAR(3) REFERENCES currencies(code),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX shipments_customer_idx
  ON shipments (customer_organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX shipments_operator_idx
  ON shipments (operator_organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX shipments_status_idx
  ON shipments (status)
  WHERE deleted_at IS NULL;

CREATE INDEX shipments_reference_search_idx
  ON shipments (lower(reference));

CREATE TABLE shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_kg NUMERIC(12, 3),
  length_cm NUMERIC(8, 2),
  width_cm NUMERIC(8, 2),
  height_cm NUMERIC(8, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX shipment_items_shipment_idx ON shipment_items (shipment_id);

CREATE TABLE shipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status shipment_status,
  note TEXT,
  actor_user_id UUID REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX shipment_events_shipment_idx
  ON shipment_events (shipment_id, occurred_at DESC);

DROP TRIGGER IF EXISTS customer_profiles_set_updated_at ON customer_profiles;
CREATE TRIGGER customer_profiles_set_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS contacts_set_updated_at ON contacts;
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS addresses_set_updated_at ON addresses;
CREATE TRIGGER addresses_set_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS shipments_set_updated_at ON shipments;
CREATE TRIGGER shipments_set_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
