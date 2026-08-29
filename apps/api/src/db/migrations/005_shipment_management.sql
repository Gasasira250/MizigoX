CREATE TYPE shipment_type AS ENUM (
  'STANDARD',
  'EXPRESS',
  'DEDICATED',
  'CONSOLIDATED',
  'OTHER'
);

CREATE TYPE shipment_priority AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT'
);

CREATE TYPE package_type AS ENUM (
  'CARTON',
  'PALLET',
  'BAG',
  'CRATE',
  'ENVELOPE',
  'DRUM',
  'OTHER'
);

CREATE TYPE weight_unit AS ENUM ('KG', 'T');
CREATE TYPE dimension_unit AS ENUM ('CM', 'M');

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

ALTER TABLE shipments
  ADD COLUMN shipment_type shipment_type NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN priority shipment_priority NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN description TEXT,
  ADD COLUMN weight_unit weight_unit NOT NULL DEFAULT 'KG',
  ADD COLUMN dimension_unit dimension_unit NOT NULL DEFAULT 'CM',
  ADD COLUMN pickup_contact_name TEXT,
  ADD COLUMN pickup_phone_e164 TEXT,
  ADD COLUMN pickup_instructions TEXT,
  ADD COLUMN delivery_contact_name TEXT,
  ADD COLUMN delivery_phone_e164 TEXT,
  ADD COLUMN delivery_instructions TEXT;

ALTER TABLE shipment_items
  ADD COLUMN weight_unit weight_unit NOT NULL DEFAULT 'KG',
  ADD COLUMN dimension_unit dimension_unit NOT NULL DEFAULT 'CM',
  ADD COLUMN volume_m3 NUMERIC(12, 4),
  ADD COLUMN package_type package_type NOT NULL DEFAULT 'CARTON',
  ADD COLUMN is_fragile BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN special_handling TEXT;

ALTER TABLE shipment_items
  ADD CONSTRAINT shipment_items_weight_nonnegative
    CHECK (weight_kg IS NULL OR weight_kg >= 0),
  ADD CONSTRAINT shipment_items_length_nonnegative
    CHECK (length_cm IS NULL OR length_cm >= 0),
  ADD CONSTRAINT shipment_items_width_nonnegative
    CHECK (width_cm IS NULL OR width_cm >= 0),
  ADD CONSTRAINT shipment_items_height_nonnegative
    CHECK (height_cm IS NULL OR height_cm >= 0),
  ADD CONSTRAINT shipment_items_volume_nonnegative
    CHECK (volume_m3 IS NULL OR volume_m3 >= 0);

ALTER TABLE shipments
  ADD CONSTRAINT shipments_weight_nonnegative
    CHECK (weight_kg IS NULL OR weight_kg >= 0),
  ADD CONSTRAINT shipments_volume_nonnegative
    CHECK (volume_m3 IS NULL OR volume_m3 >= 0),
  ADD CONSTRAINT shipments_declared_value_nonnegative
    CHECK (declared_value IS NULL OR declared_value >= 0);

ALTER TABLE shipment_events
  ADD COLUMN previous_status shipment_status,
  ADD COLUMN location_label TEXT,
  ADD COLUMN latitude NUMERIC(10, 7),
  ADD COLUMN longitude NUMERIC(10, 7),
  ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX shipments_priority_idx
  ON shipments (priority)
  WHERE deleted_at IS NULL;

CREATE INDEX shipments_type_idx
  ON shipments (shipment_type)
  WHERE deleted_at IS NULL;

CREATE INDEX shipments_estimated_delivery_idx
  ON shipments (estimated_delivery_at)
  WHERE deleted_at IS NULL;

CREATE INDEX shipments_created_at_idx
  ON shipments (created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS shipment_items_set_updated_at ON shipment_items;
CREATE TRIGGER shipment_items_set_updated_at
  BEFORE UPDATE ON shipment_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
