CREATE TYPE customer_type AS ENUM (
  'BUSINESS',
  'INDIVIDUAL',
  'GOVERNMENT',
  'NGO',
  'OTHER'
);

CREATE TYPE contact_status AS ENUM (
  'ACTIVE',
  'INACTIVE'
);

CREATE TYPE address_type AS ENUM (
  'PICKUP',
  'DELIVERY',
  'BILLING',
  'OFFICE',
  'WAREHOUSE',
  'OTHER'
);

CREATE TABLE customer_reference_counters (
  country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (country_code, year)
);

ALTER TABLE customer_profiles
  ADD COLUMN customer_reference TEXT,
  ADD COLUMN customer_type customer_type NOT NULL DEFAULT 'BUSINESS',
  ADD COLUMN website TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN notes TEXT,
  ADD COLUMN created_by_user_id UUID REFERENCES users(id);

ALTER TABLE contacts
  ADD COLUMN status contact_status NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE addresses
  ADD COLUMN address_type address_type NOT NULL DEFAULT 'OTHER';

CREATE OR REPLACE FUNCTION assign_customer_reference()
RETURNS trigger AS $$
DECLARE
  country VARCHAR(2);
  year_value INTEGER;
  next_value INTEGER;
BEGIN
  IF NEW.customer_reference IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT country_code INTO country
  FROM organizations
  WHERE id = NEW.organization_id;

  country := COALESCE(country, 'RW');
  year_value := EXTRACT(YEAR FROM now())::int;

  INSERT INTO customer_reference_counters (country_code, year, last_value)
  VALUES (country, year_value, 1)
  ON CONFLICT (country_code, year)
  DO UPDATE SET last_value = customer_reference_counters.last_value + 1
  RETURNING last_value INTO next_value;

  NEW.customer_reference :=
    'CUS-' || country || '-' || year_value || '-' || lpad(next_value::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_profiles_assign_reference ON customer_profiles;
CREATE TRIGGER customer_profiles_assign_reference
  BEFORE INSERT ON customer_profiles
  FOR EACH ROW EXECUTE FUNCTION assign_customer_reference();

DO $$
DECLARE
  rec RECORD;
  year_value INTEGER;
  next_value INTEGER;
BEGIN
  FOR rec IN
    SELECT p.organization_id, o.country_code, o.created_at
    FROM customer_profiles p
    JOIN organizations o ON o.id = p.organization_id
    WHERE p.customer_reference IS NULL
    ORDER BY o.created_at, p.organization_id
  LOOP
    year_value := EXTRACT(YEAR FROM rec.created_at)::int;
    INSERT INTO customer_reference_counters (country_code, year, last_value)
    VALUES (rec.country_code, year_value, 1)
    ON CONFLICT (country_code, year)
    DO UPDATE SET last_value = customer_reference_counters.last_value + 1
    RETURNING last_value INTO next_value;

    UPDATE customer_profiles
    SET customer_reference =
      'CUS-' || rec.country_code || '-' || year_value || '-' || lpad(next_value::text, 5, '0')
    WHERE organization_id = rec.organization_id;
  END LOOP;
END $$;

ALTER TABLE customer_profiles
  ALTER COLUMN customer_reference SET NOT NULL;

CREATE UNIQUE INDEX customer_profiles_reference_uidx
  ON customer_profiles (customer_reference);

CREATE INDEX customer_profiles_reference_search_idx
  ON customer_profiles (lower(customer_reference));

CREATE INDEX customer_profiles_type_idx
  ON customer_profiles (customer_type);

CREATE INDEX customer_profiles_city_idx
  ON customer_profiles (lower(city));

CREATE INDEX customer_profiles_created_by_idx
  ON customer_profiles (created_by_user_id);

CREATE UNIQUE INDEX customers_operator_name_uidx
  ON organizations (parent_organization_id, lower(name))
  WHERE type = 'CUSTOMER' AND deleted_at IS NULL;

CREATE UNIQUE INDEX customers_tax_id_uidx
  ON organizations (country_code, lower(tax_id))
  WHERE type = 'CUSTOMER'
    AND deleted_at IS NULL
    AND tax_id IS NOT NULL
    AND btrim(tax_id) <> '';

CREATE INDEX organizations_customers_status_idx
  ON organizations (status)
  WHERE type = 'CUSTOMER' AND deleted_at IS NULL;

CREATE INDEX organizations_customers_created_idx
  ON organizations (created_at DESC)
  WHERE type = 'CUSTOMER' AND deleted_at IS NULL;

CREATE UNIQUE INDEX contacts_one_primary_uidx
  ON contacts (organization_id)
  WHERE is_primary AND deleted_at IS NULL;

CREATE INDEX contacts_status_idx
  ON contacts (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX addresses_one_default_uidx
  ON addresses (organization_id)
  WHERE is_default AND deleted_at IS NULL;

CREATE INDEX addresses_type_idx
  ON addresses (organization_id, address_type)
  WHERE deleted_at IS NULL;

CREATE INDEX addresses_geo_idx
  ON addresses (latitude, longitude)
  WHERE deleted_at IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
