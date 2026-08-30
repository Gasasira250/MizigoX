CREATE TABLE IF NOT EXISTS tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  rate_percent NUMERIC(5, 2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  country_code VARCHAR(2) NOT NULL REFERENCES countries(code),
  currency_code VARCHAR(3) REFERENCES currencies(code),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, code)
);

CREATE TABLE IF NOT EXISTS billable_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  service_type TEXT NOT NULL,
  unit TEXT NOT NULL,
  default_price NUMERIC(18, 2),
  currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  tax_rate_id UUID REFERENCES tax_rates(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS billable_services_org_active_idx
  ON billable_services (organization_id, active);

CREATE TABLE IF NOT EXISTS customer_service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_organization_id UUID NOT NULL REFERENCES organizations(id),
  service_id UUID NOT NULL REFERENCES billable_services(id),
  pricing_basis TEXT NOT NULL,
  unit_price NUMERIC(18, 2) NOT NULL CHECK (unit_price >= 0),
  currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_organization_id, service_id, pricing_basis)
);

CREATE TABLE IF NOT EXISTS invoice_reference_counters (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_value INTEGER NOT NULL
);

INSERT INTO invoice_reference_counters (id, last_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS payment_reference_counters (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_value INTEGER NOT NULL
);

INSERT INTO payment_reference_counters (id, last_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_organization_id UUID NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL,
  currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
  issue_date DATE,
  due_date DATE,
  payment_terms TEXT NOT NULL DEFAULT 'NET_30',
  notes TEXT,
  billing_address TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS invoices_org_status_idx
  ON invoices (organization_id, status, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS invoices_customer_idx
  ON invoices (customer_organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS invoices_number_idx ON invoices (number);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  service_id UUID REFERENCES billable_services(id),
  shipment_id UUID REFERENCES shipments(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_price NUMERIC(18, 2) NOT NULL CHECK (unit_price >= 0),
  discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100),
  tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_subtotal NUMERIC(18, 2) NOT NULL CHECK (line_subtotal >= 0),
  line_total NUMERIC(18, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (invoice_id);

CREATE TABLE IF NOT EXISTS invoice_shipments (
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  PRIMARY KEY (invoice_id, shipment_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_organization_id UUID NOT NULL REFERENCES organizations(id),
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  provider_event_id TEXT,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  idempotency_key TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_idx
  ON payments (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_event_idx
  ON payments (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_org_status_idx ON payments (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS financial_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  payment_id UUID REFERENCES payments(id),
  adjustment_type TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  reason TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financial_adjustments_invoice_idx
  ON financial_adjustments (invoice_id, created_at DESC);

INSERT INTO tax_rates (name, code, rate_percent, country_code, currency_code, active)
VALUES ('Rwanda VAT', 'RW-VAT', 18.00, 'RW', 'RWF', true)
ON CONFLICT (country_code, code) DO NOTHING;

DROP TRIGGER IF EXISTS tax_rates_set_updated_at ON tax_rates;
CREATE TRIGGER tax_rates_set_updated_at
  BEFORE UPDATE ON tax_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS billable_services_set_updated_at ON billable_services;
CREATE TRIGGER billable_services_set_updated_at
  BEFORE UPDATE ON billable_services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS customer_service_prices_set_updated_at ON customer_service_prices;
CREATE TRIGGER customer_service_prices_set_updated_at
  BEFORE UPDATE ON customer_service_prices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS invoice_items_set_updated_at ON invoice_items;
CREATE TRIGGER invoice_items_set_updated_at
  BEFORE UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS payments_set_updated_at ON payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
