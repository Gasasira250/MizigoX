DO $$ BEGIN
  CREATE TYPE shipment_type AS ENUM (
    'STANDARD',
    'EXPRESS',
    'DEDICATED',
    'CONSOLIDATED',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE shipment_priority AS ENUM (
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE package_type AS ENUM (
    'CARTON',
    'PALLET',
    'BAG',
    'CRATE',
    'ENVELOPE',
    'DRUM',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE weight_unit AS ENUM ('KG', 'T');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dimension_unit AS ENUM ('CM', 'M');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'shipment_status'
      AND e.enumlabel = 'BOOKED'
  ) THEN
    CREATE TYPE shipment_status_v2 AS ENUM (
      'DRAFT',
      'PENDING',
      'CONFIRMED',
      'ASSIGNED',
      'READY_FOR_PICKUP',
      'PICKED_UP',
      'IN_TRANSIT',
      'AT_DESTINATION',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'DELIVERY_FAILED',
      'CANCELLED'
    );

    ALTER TABLE shipments
      ALTER COLUMN status DROP DEFAULT;

    ALTER TABLE shipments
      ALTER COLUMN status TYPE TEXT
      USING status::text;

    ALTER TABLE shipment_events
      ALTER COLUMN status TYPE TEXT
      USING status::text;

    UPDATE shipments
    SET status = CASE status
      WHEN 'BOOKED' THEN 'CONFIRMED'
      WHEN 'PICKUP_IN_PROGRESS' THEN 'READY_FOR_PICKUP'
      WHEN 'EXCEPTION' THEN 'DELIVERY_FAILED'
      ELSE status
    END;

    UPDATE shipment_events
    SET status = CASE status
      WHEN 'BOOKED' THEN 'CONFIRMED'
      WHEN 'PICKUP_IN_PROGRESS' THEN 'READY_FOR_PICKUP'
      WHEN 'EXCEPTION' THEN 'DELIVERY_FAILED'
      ELSE status
    END;

    UPDATE shipment_events
    SET event_type = 'CREATED'
    WHERE event_type = 'BOOKED';

    DROP TYPE shipment_status;
    ALTER TYPE shipment_status_v2 RENAME TO shipment_status;

    ALTER TABLE shipments
      ALTER COLUMN status TYPE shipment_status
      USING status::shipment_status;

    ALTER TABLE shipments
      ALTER COLUMN status SET DEFAULT 'CONFIRMED';

    ALTER TABLE shipment_events
      ALTER COLUMN status TYPE shipment_status
      USING NULLIF(status, '')::shipment_status;
  END IF;
END $$;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS shipment_type shipment_type NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS priority shipment_priority NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS weight_unit weight_unit NOT NULL DEFAULT 'KG',
  ADD COLUMN IF NOT EXISTS dimension_unit dimension_unit NOT NULL DEFAULT 'CM',
  ADD COLUMN IF NOT EXISTS pickup_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS pickup_phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS pickup_instructions TEXT,
  ADD COLUMN IF NOT EXISTS delivery_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS delivery_phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;

ALTER TABLE shipment_items
  ADD COLUMN IF NOT EXISTS weight_unit weight_unit NOT NULL DEFAULT 'KG',
  ADD COLUMN IF NOT EXISTS dimension_unit dimension_unit NOT NULL DEFAULT 'CM',
  ADD COLUMN IF NOT EXISTS volume_m3 NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS package_type package_type NOT NULL DEFAULT 'CARTON',
  ADD COLUMN IF NOT EXISTS is_fragile BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS special_handling TEXT;

DO $$ BEGIN
  ALTER TABLE shipment_items
    ADD CONSTRAINT shipment_items_weight_nonnegative
      CHECK (weight_kg IS NULL OR weight_kg >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shipment_items
    ADD CONSTRAINT shipment_items_length_nonnegative
      CHECK (length_cm IS NULL OR length_cm >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shipment_items
    ADD CONSTRAINT shipment_items_width_nonnegative
      CHECK (width_cm IS NULL OR width_cm >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shipment_items
    ADD CONSTRAINT shipment_items_height_nonnegative
      CHECK (height_cm IS NULL OR height_cm >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shipment_items
    ADD CONSTRAINT shipment_items_volume_nonnegative
      CHECK (volume_m3 IS NULL OR volume_m3 >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shipments
    ADD CONSTRAINT shipments_weight_nonnegative
      CHECK (weight_kg IS NULL OR weight_kg >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shipments
    ADD CONSTRAINT shipments_volume_nonnegative
      CHECK (volume_m3 IS NULL OR volume_m3 >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE shipments
    ADD CONSTRAINT shipments_declared_value_nonnegative
      CHECK (declared_value IS NULL OR declared_value >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE shipment_events
  ADD COLUMN IF NOT EXISTS previous_status shipment_status,
  ADD COLUMN IF NOT EXISTS location_label TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS shipments_priority_idx
  ON shipments (priority)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS shipments_type_idx
  ON shipments (shipment_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS shipments_estimated_delivery_idx
  ON shipments (estimated_delivery_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS shipments_created_at_idx
  ON shipments (created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS shipment_items_set_updated_at ON shipment_items;
CREATE TRIGGER shipment_items_set_updated_at
  BEFORE UPDATE ON shipment_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
