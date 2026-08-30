ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_driver_id UUID REFERENCES drivers(id);

CREATE INDEX IF NOT EXISTS routes_accepted_by_driver_idx
  ON routes (accepted_by_driver_id)
  WHERE accepted_by_driver_id IS NOT NULL AND deleted_at IS NULL;

DO $$ BEGIN
  CREATE TYPE pod_status AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT,
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  original_filename TEXT,
  checksum_sha256 TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS storage_objects_org_idx
  ON storage_objects (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS proofs_of_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  route_id UUID REFERENCES routes(id),
  stop_id UUID REFERENCES route_stops(id),
  driver_id UUID REFERENCES drivers(id),
  submitted_by_user_id UUID NOT NULL REFERENCES users(id),
  recipient_name TEXT NOT NULL,
  recipient_phone_e164 TEXT,
  notes TEXT,
  signature_storage_object_id UUID REFERENCES storage_objects(id),
  evidence_storage_object_id UUID REFERENCES storage_objects(id),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  captured_at TIMESTAMPTZ,
  status pod_status NOT NULL DEFAULT 'SUBMITTED',
  verified_at TIMESTAMPTZ,
  verified_by_user_id UUID REFERENCES users(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT proofs_of_delivery_coords_check
    CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR (latitude IS NOT NULL AND longitude IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS proofs_of_delivery_shipment_unique
  ON proofs_of_delivery (shipment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS proofs_of_delivery_org_idx
  ON proofs_of_delivery (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS proofs_of_delivery_driver_idx
  ON proofs_of_delivery (driver_id, created_at DESC)
  WHERE deleted_at IS NULL AND driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS proofs_of_delivery_status_idx
  ON proofs_of_delivery (status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS proofs_of_delivery_set_updated_at ON proofs_of_delivery;
CREATE TRIGGER proofs_of_delivery_set_updated_at
  BEFORE UPDATE ON proofs_of_delivery
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
