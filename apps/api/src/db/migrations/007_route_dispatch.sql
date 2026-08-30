DO $$ BEGIN
  CREATE TYPE route_status AS ENUM (
    'DRAFT',
    'PLANNED',
    'READY',
    'DISPATCHED',
    'IN_TRANSIT',
    'ARRIVED',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE route_type AS ENUM (
    'STANDARD',
    'EXPRESS',
    'DEDICATED',
    'CONSOLIDATED',
    'RETURN',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE route_stop_type AS ENUM (
    'PICKUP',
    'DELIVERY',
    'WAYPOINT',
    'RETURN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE route_stop_status AS ENUM (
    'PENDING',
    'ARRIVED',
    'SERVICED',
    'SKIPPED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS route_reference_counters (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_value INTEGER NOT NULL DEFAULT 0
);

INSERT INTO route_reference_counters (id, last_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  status route_status NOT NULL DEFAULT 'DRAFT',
  route_type route_type NOT NULL DEFAULT 'STANDARD',
  origin_text TEXT,
  destination_text TEXT,
  planned_departure_at TIMESTAMPTZ,
  planned_arrival_at TIMESTAMPTZ,
  actual_departure_at TIMESTAMPTZ,
  actual_arrival_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  distance_km NUMERIC(12, 3) CHECK (distance_km IS NULL OR distance_km >= 0),
  estimated_duration_minutes INTEGER CHECK (
    estimated_duration_minutes IS NULL OR estimated_duration_minutes >= 0
  ),
  notes TEXT,
  vehicle_id UUID REFERENCES vehicles(id),
  driver_id UUID REFERENCES drivers(id),
  previous_vehicle_status TEXT,
  previous_driver_status TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT routes_planned_dates_check
    CHECK (
      planned_departure_at IS NULL
      OR planned_arrival_at IS NULL
      OR planned_arrival_at >= planned_departure_at
    )
);

CREATE INDEX IF NOT EXISTS routes_organization_idx
  ON routes (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS routes_status_idx
  ON routes (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS routes_vehicle_idx
  ON routes (vehicle_id)
  WHERE deleted_at IS NULL AND vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS routes_driver_idx
  ON routes (driver_id)
  WHERE deleted_at IS NULL AND driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS routes_planned_departure_idx
  ON routes (planned_departure_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS routes_reference_search_idx
  ON routes (lower(reference));

CREATE TABLE IF NOT EXISTS route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  shipment_id UUID REFERENCES shipments(id),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  stop_type route_stop_type NOT NULL,
  status route_stop_status NOT NULL DEFAULT 'PENDING',
  address_id UUID REFERENCES addresses(id),
  formatted_address TEXT NOT NULL,
  contact_name TEXT,
  contact_phone_e164 TEXT,
  planned_arrival_at TIMESTAMPTZ,
  actual_arrival_at TIMESTAMPTZ,
  planned_departure_at TIMESTAMPTZ,
  actual_departure_at TIMESTAMPTZ,
  instructions TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS route_stops_sequence_unique
  ON route_stops (route_id, sequence)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS route_stops_route_idx
  ON route_stops (route_id, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS route_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, shipment_id)
);

CREATE INDEX IF NOT EXISTS route_shipments_shipment_idx
  ON route_shipments (shipment_id);

CREATE INDEX IF NOT EXISTS route_shipments_org_idx
  ON route_shipments (organization_id);

CREATE TABLE IF NOT EXISTS route_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL,
  previous_status route_status,
  status route_status,
  description TEXT,
  actor_user_id UUID REFERENCES users(id),
  location_label TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_events_route_idx
  ON route_events (route_id, occurred_at);

DROP TRIGGER IF EXISTS routes_set_updated_at ON routes;
CREATE TRIGGER routes_set_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS route_stops_set_updated_at ON route_stops;
CREATE TRIGGER route_stops_set_updated_at
  BEFORE UPDATE ON route_stops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
