import type { CustomerPayload, ShipmentPayload } from '@mizigox/shared';
import { canCreateShipments, canUpdateShipments, isCargoLocked } from '@mizigox/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { useToast } from '../../shared/ui/ToastProvider';
import {
  buildShipmentPayload,
  countryOptions,
  currencyOptions,
  emptyPackage,
  emptyShipmentForm,
  formFromShipment,
  formatApiError,
  packageOptions,
  priorityOptions,
  selectedCustomer,
  typeOptions,
  validateShipmentForm,
  type PackageDraft,
  type ShipmentFormState,
} from './form-utils';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ShipmentFormPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const { shipmentId } = useParams();
  const isEdit = Boolean(shipmentId && UUID_PATTERN.test(shipmentId));
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const isStaff = user?.organization.type !== 'CUSTOMER';
  const allowed = isEdit
    ? canUpdateShipments(user?.permissions)
    : canCreateShipments(user?.permissions);
  const [customers, setCustomers] = useState<CustomerPayload[]>([]);
  const [form, setForm] = useState<ShipmentFormState>(emptyShipmentForm());
  const [currentStatus, setCurrentStatus] = useState<ShipmentPayload['status'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const customer = selectedCustomer(customers, form.customerId);
  const cargoLocked = currentStatus ? isCargoLocked(currentStatus) : false;

  useEffect(() => {
    if (!isStaff) {
      return;
    }
    apiGet<CustomerPayload[]>('/customers?pageSize=100')
      .then((rows) => {
        setCustomers(rows);
        setForm((current) => ({ ...current, customerId: current.customerId || rows[0]?.id || '' }));
      })
      .catch((cause) => setError(formatApiError(cause, 'Unable to load customers')));
  }, [isStaff]);

  useEffect(() => {
    if (!isEdit || !shipmentId) {
      return;
    }
    apiGet<ShipmentPayload>(`/shipments/${shipmentId}`)
      .then((shipment) => {
        setForm(formFromShipment(shipment));
        setCurrentStatus(shipment.status);
      })
      .catch((cause) => setError(formatApiError(cause, 'Unable to load shipment')))
      .finally(() => setLoading(false));
  }, [isEdit, shipmentId]);

  function update<K extends keyof ShipmentFormState>(key: K, value: ShipmentFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePackage(key: string, patch: Partial<PackageDraft>) {
    setForm((current) => ({
      ...current,
      packages: current.packages.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
  }

  async function submit(status?: 'DRAFT' | 'CONFIRMED') {
    const messages = validateShipmentForm(form, isStaff);
    if (messages.length > 0) {
      setError(messages[0] ?? 'Check the required fields.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildShipmentPayload(form, {
        includeCustomer: isStaff && !isEdit,
        cargoLocked,
        status: isEdit ? undefined : status,
      });
      if (isEdit && shipmentId) {
        const shipment = await apiPatch<ShipmentPayload>(`/shipments/${shipmentId}`, payload);
        notify(`${shipment.reference} was updated.`);
        navigate(`${basePath}/shipments/${shipment.id}`);
        return;
      }
      const shipment = await apiPost<ShipmentPayload>('/shipments', payload);
      notify(
        status === 'DRAFT'
          ? `${shipment.reference} was saved as a draft.`
          : `${shipment.reference} was created.`,
      );
      navigate(`${basePath}/shipments/${shipment.id}`);
    } catch (cause) {
      setError(
        formatApiError(cause, isEdit ? 'Unable to update shipment' : 'Unable to create shipment'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(isEdit ? undefined : 'CONFIRMED');
  }

  if (!allowed) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">You cannot do this.</p>
    );
  }
  if (loading) {
    return <p className="text-sm text-slate-500">Loading shipment…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to={`${basePath}/shipments`}>
          Back to shipments
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Phase 5
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">
          {isEdit ? 'Edit shipment' : 'Create shipment'}
        </h1>
      </div>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        {isStaff ? (
          <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
            <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">Customer</h2>
            <Field label="Customer" required>
              <select
                className={inputClass}
                value={form.customerId}
                onChange={(event) => update('customerId', event.target.value)}
                disabled={isEdit}
                required
              >
                <option value="">Select customer</option>
                {customers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.customerReference ? `${row.customerReference} · ` : ''}
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              {customer ? (
                <>
                  <p>{customer.primaryContactName ?? 'No primary contact'}</p>
                  <p>{customer.phoneE164 ?? 'No phone'}</p>
                  <p>{customer.email ?? 'No email'}</p>
                </>
              ) : (
                <p>Select a customer to see contact details.</p>
              )}
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">Shipment</h2>
          <Field label="Shipment type">
            <select
              className={inputClass}
              value={form.shipmentType}
              onChange={(event) => update('shipmentType', event.target.value)}
            >
              {typeOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              className={inputClass}
              value={form.priority}
              onChange={(event) => update('priority', event.target.value)}
            >
              {priorityOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Internal description">
            <input
              className={inputClass}
              value={form.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </Field>
          <Field label="Cargo type">
            <input
              className={inputClass}
              value={form.cargoType}
              onChange={(event) => update('cargoType', event.target.value)}
            />
          </Field>
          <label className="text-sm font-medium md:col-span-2">
            Cargo description <span className="text-red-600">*</span>
            <textarea
              className={`${inputClass} min-h-20`}
              value={form.cargoDescription}
              onChange={(event) => update('cargoDescription', event.target.value)}
              required
            />
          </label>
          <Field label="Requested pickup">
            <input
              className={inputClass}
              type="datetime-local"
              value={form.estimatedPickupAt}
              onChange={(event) => update('estimatedPickupAt', event.target.value)}
            />
          </Field>
          <Field label="Requested delivery">
            <input
              className={inputClass}
              type="datetime-local"
              value={form.estimatedDeliveryAt}
              onChange={(event) => update('estimatedDeliveryAt', event.target.value)}
            />
          </Field>
        </section>

        {cargoLocked ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Pickup, delivery, and packages are locked after pickup.
          </p>
        ) : null}

        <StopSection
          title="Pickup"
          disabled={cargoLocked}
          rwanda={form.pickupCountry === 'RW'}
          contact={form.pickupContactName}
          phone={form.pickupPhone}
          country={form.pickupCountry}
          province={form.pickupProvince}
          district={form.pickupDistrict}
          sector={form.pickupSector}
          street={form.pickupStreet}
          latitude={form.pickupLatitude}
          longitude={form.pickupLongitude}
          instructions={form.pickupInstructions}
          onChange={(field, value) =>
            update(
              (
                {
                  contact: 'pickupContactName',
                  phone: 'pickupPhone',
                  country: 'pickupCountry',
                  province: 'pickupProvince',
                  district: 'pickupDistrict',
                  sector: 'pickupSector',
                  street: 'pickupStreet',
                  latitude: 'pickupLatitude',
                  longitude: 'pickupLongitude',
                  instructions: 'pickupInstructions',
                } as const
              )[field],
              value,
            )
          }
        />
        <StopSection
          title="Delivery"
          disabled={cargoLocked}
          rwanda={form.deliveryCountry === 'RW'}
          contact={form.deliveryContactName}
          phone={form.deliveryPhone}
          country={form.deliveryCountry}
          province={form.deliveryProvince}
          district={form.deliveryDistrict}
          sector={form.deliverySector}
          street={form.deliveryStreet}
          latitude={form.deliveryLatitude}
          longitude={form.deliveryLongitude}
          instructions={form.deliveryInstructions}
          onChange={(field, value) =>
            update(
              (
                {
                  contact: 'deliveryContactName',
                  phone: 'deliveryPhone',
                  country: 'deliveryCountry',
                  province: 'deliveryProvince',
                  district: 'deliveryDistrict',
                  sector: 'deliverySector',
                  street: 'deliveryStreet',
                  latitude: 'deliveryLatitude',
                  longitude: 'deliveryLongitude',
                  instructions: 'deliveryInstructions',
                } as const
              )[field],
              value,
            )
          }
        />

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#12355b]">Cargo / packages</h2>
            <button
              type="button"
              className="text-sm text-teal-800 hover:underline disabled:opacity-50"
              disabled={cargoLocked}
              onClick={() => update('packages', [...form.packages, emptyPackage()])}
            >
              Add package
            </button>
          </div>
          {form.packages.map((item, index) => (
            <div
              key={item.key}
              className="grid gap-3 rounded-md border border-slate-100 p-3 md:grid-cols-6"
            >
              <label className="text-sm font-medium md:col-span-2">
                Description
                <input
                  className={inputClass}
                  value={item.description}
                  onChange={(event) => updatePackage(item.key, { description: event.target.value })}
                  placeholder={`Package ${index + 1}`}
                  disabled={cargoLocked}
                />
              </label>
              <label className="text-sm font-medium">
                Qty
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(event) => updatePackage(item.key, { quantity: event.target.value })}
                  disabled={cargoLocked}
                />
              </label>
              <label className="text-sm font-medium">
                Weight (kg)
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={item.weight}
                  onChange={(event) => updatePackage(item.key, { weight: event.target.value })}
                  disabled={cargoLocked}
                />
              </label>
              <label className="text-sm font-medium">
                Type
                <select
                  className={inputClass}
                  value={item.packageType}
                  onChange={(event) => updatePackage(item.key, { packageType: event.target.value })}
                  disabled={cargoLocked}
                >
                  {packageOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.isFragile}
                  onChange={(event) => updatePackage(item.key, { isFragile: event.target.checked })}
                  disabled={cargoLocked}
                />
                Fragile
              </label>
              <input
                className={inputClass}
                placeholder="L cm"
                value={item.length}
                onChange={(event) => updatePackage(item.key, { length: event.target.value })}
                disabled={cargoLocked}
              />
              <input
                className={inputClass}
                placeholder="W cm"
                value={item.width}
                onChange={(event) => updatePackage(item.key, { width: event.target.value })}
                disabled={cargoLocked}
              />
              <input
                className={inputClass}
                placeholder="H cm"
                value={item.height}
                onChange={(event) => updatePackage(item.key, { height: event.target.value })}
                disabled={cargoLocked}
              />
              <input
                className={`${inputClass} md:col-span-2`}
                placeholder="Special handling"
                value={item.specialHandling}
                onChange={(event) =>
                  updatePackage(item.key, { specialHandling: event.target.value })
                }
                disabled={cargoLocked}
              />
              {form.packages.length > 1 && !cargoLocked ? (
                <button
                  type="button"
                  className="text-sm text-red-700 hover:underline"
                  onClick={() =>
                    update(
                      'packages',
                      form.packages.filter((row) => row.key !== item.key),
                    )
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </section>

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">
            Commercial information
          </h2>
          <Field label="Declared value">
            <input
              className={inputClass}
              type="number"
              min="0"
              value={form.declaredValue}
              onChange={(event) => update('declaredValue', event.target.value)}
            />
          </Field>
          <Field label="Currency">
            <select
              className={inputClass}
              value={form.declaredCurrencyCode}
              onChange={(event) => update('declaredCurrencyCode', event.target.value)}
            >
              {currencyOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="text-sm font-medium md:col-span-2">
            Special handling requirements
            <textarea
              className={`${inputClass} min-h-20`}
              value={form.specialInstructions}
              onChange={(event) => update('specialInstructions', event.target.value)}
            />
          </label>
        </section>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md bg-[#12355b] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create shipment'}
          </button>
          {!isEdit ? (
            <button
              className="rounded-md border px-4 py-2 text-sm disabled:opacity-60"
              disabled={submitting}
              type="button"
              onClick={() => {
                void submit('DRAFT');
              }}
            >
              Save as draft
            </button>
          ) : null}
          <Link className="rounded-md border px-4 py-2 text-sm" to={`${basePath}/shipments`}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function StopSection({
  title,
  disabled,
  rwanda,
  contact,
  phone,
  country,
  province,
  district,
  sector,
  street,
  latitude,
  longitude,
  instructions,
  onChange,
}: {
  title: string;
  disabled?: boolean;
  rwanda: boolean;
  contact: string;
  phone: string;
  country: string;
  province: string;
  district: string;
  sector: string;
  street: string;
  latitude: string;
  longitude: string;
  instructions: string;
  onChange: (
    field:
      | 'contact'
      | 'phone'
      | 'country'
      | 'province'
      | 'district'
      | 'sector'
      | 'street'
      | 'latitude'
      | 'longitude'
      | 'instructions',
    value: string,
  ) => void;
}) {
  return (
    <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
      <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">{title}</h2>
      <Field label="Contact name">
        <input
          className={inputClass}
          value={contact}
          disabled={disabled}
          onChange={(event) => onChange('contact', event.target.value)}
        />
      </Field>
      <Field label="Phone">
        <input
          className={inputClass}
          value={phone}
          disabled={disabled}
          onChange={(event) => onChange('phone', event.target.value)}
          placeholder="+250788123456"
        />
      </Field>
      <Field label="Country" required>
        <select
          className={inputClass}
          value={country}
          disabled={disabled}
          onChange={(event) => onChange('country', event.target.value)}
        >
          {countryOptions().map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={rwanda ? 'Province' : 'Province / region'}>
        <input
          className={inputClass}
          value={province}
          disabled={disabled}
          onChange={(event) => onChange('province', event.target.value)}
        />
      </Field>
      <Field label={rwanda ? 'District' : 'District / city'}>
        <input
          className={inputClass}
          value={district}
          disabled={disabled}
          onChange={(event) => onChange('district', event.target.value)}
        />
      </Field>
      <Field label={rwanda ? 'Sector / area' : 'Area'}>
        <input
          className={inputClass}
          value={sector}
          disabled={disabled}
          onChange={(event) => onChange('sector', event.target.value)}
        />
      </Field>
      <Field label="Street / address details" required>
        <input
          className={inputClass}
          value={street}
          disabled={disabled}
          onChange={(event) => onChange('street', event.target.value)}
          required
        />
      </Field>
      <Field label="Latitude">
        <input
          className={inputClass}
          value={latitude}
          disabled={disabled}
          onChange={(event) => onChange('latitude', event.target.value)}
          placeholder="-1.9441"
        />
      </Field>
      <Field label="Longitude">
        <input
          className={inputClass}
          value={longitude}
          disabled={disabled}
          onChange={(event) => onChange('longitude', event.target.value)}
          placeholder="30.0619"
        />
      </Field>
      <label className="text-sm font-medium md:col-span-2">
        Special instructions
        <textarea
          className={`${inputClass} min-h-20`}
          value={instructions}
          disabled={disabled}
          onChange={(event) => onChange('instructions', event.target.value)}
        />
      </label>
    </section>
  );
}

const inputClass = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      {required ? <span className="text-red-600"> *</span> : null}
      {children}
    </label>
  );
}
