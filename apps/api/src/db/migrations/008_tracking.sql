CREATE TABLE IF NOT EXISTS location_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  driver_id UUID REFERENCES drivers(id),
  route_id UUID REFERENCES routes(id),
  shipment_id UUID REFERENCES shipments(id),
  latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude NUMERIC(11, 7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  accuracy_meters NUMERIC(8, 2) CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  speed_kph NUMERIC(7, 2) CHECK (speed_kph IS NULL OR speed_kph >= 0),
  heading_degrees NUMERIC(6, 2) CHECK (
    heading_degrees IS NULL OR (heading_degrees >= 0 AND heading_degrees <= 360)
  ),
  altitude_meters NUMERIC(8, 2),
  battery_percent NUMERIC(5, 2) CHECK (
    battery_percent IS NULL OR (battery_percent >= 0 AND battery_percent <= 100)
  ),
  source TEXT NOT NULL DEFAULT 'DRIVER_APP',
  device_timestamp TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS location_records_vehicle_time_idx
  ON location_records (vehicle_id, received_at DESC);

CREATE INDEX IF NOT EXISTS location_records_driver_time_idx
  ON location_records (driver_id, received_at DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS location_records_route_time_idx
  ON location_records (route_id, received_at DESC)
  WHERE route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS location_records_shipment_time_idx
  ON location_records (shipment_id, received_at DESC)
  WHERE shipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS location_records_org_time_idx
  ON location_records (organization_id, received_at DESC);

CREATE TABLE IF NOT EXISTS vehicle_current_locations (
  vehicle_id UUID PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  driver_id UUID REFERENCES drivers(id),
  route_id UUID REFERENCES routes(id),
  shipment_id UUID REFERENCES shipments(id),
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(11, 7) NOT NULL,
  accuracy_meters NUMERIC(8, 2),
  speed_kph NUMERIC(7, 2),
  heading_degrees NUMERIC(6, 2),
  source TEXT NOT NULL,
  last_updated_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_current_locations_org_updated_idx
  ON vehicle_current_locations (organization_id, last_updated_at DESC);

CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id),
  driver_id UUID REFERENCES drivers(id),
  route_id UUID REFERENCES routes(id),
  shipment_id UUID REFERENCES shipments(id),
  stop_id UUID REFERENCES route_stops(id),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(11, 7),
  description TEXT,
  actor_user_id UUID REFERENCES users(id),
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracking_events_org_time_idx
  ON tracking_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS tracking_events_route_time_idx
  ON tracking_events (route_id, occurred_at DESC)
  WHERE route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_events_shipment_time_idx
  ON tracking_events (shipment_id, occurred_at DESC)
  WHERE shipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_events_vehicle_time_idx
  ON tracking_events (vehicle_id, occurred_at DESC)
  WHERE vehicle_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_dedupe_idx
  ON tracking_events (
    event_type,
    coalesce(route_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(shipment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(stop_id, '00000000-0000-0000-0000-000000000000'::uuid),
    date_trunc('minute', occurred_at)
  )
  WHERE event_type <> 'LOCATION_UPDATED';

CREATE TABLE IF NOT EXISTS shipment_tracking_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shipment_tracking_tokens_shipment_idx
  ON shipment_tracking_tokens (shipment_id, created_at DESC);
