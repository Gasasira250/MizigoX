import type { VehiclePayload, VehicleTypePayload } from '@mizigox/shared';
import { canCreateVehicles, canUpdateVehicles } from '@mizigox/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiGet, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { useToast } from '../../shared/ui/ToastProvider';
import {
  UUID_PATTERN,
  formatApiError,
  fuelTypeOptions,
  optionalNumber,
  ownershipOptions,
  payloadUnitOptions,
} from '../fleet/form-utils';

interface OperatorOption {
  id: string;
  name: string;
  countryCode: string;
}

const emptyForm = {
  organizationId: '',
  vehicleType: 'LIGHT_TRUCK',
  registrationNumber: '',
  make: '',
  model: '',
  year: '',
  color: '',
  vin: '',
  engineNumber: '',
  payloadCapacity: '',
  payloadUnit: 'KG',
  lengthM: '',
  widthM: '',
  heightM: '',
  fuelType: '',
  ownershipType: 'OWNED',
  status: 'ACTIVE',
  notes: '',
};

type VehicleFormState = typeof emptyForm;

export function VehicleFormPage() {
  const { vehicleId } = useParams();
  const isEdit = Boolean(vehicleId && UUID_PATTERN.test(vehicleId));
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const isPlatform = user?.organization.type === 'PLATFORM';
  const allowed = isEdit
    ? canUpdateVehicles(user?.permissions)
    : canCreateVehicles(user?.permissions);
  const [form, setForm] = useState<VehicleFormState>(emptyForm);
  const [types, setTypes] = useState<VehicleTypePayload[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [typeRows, operatorRows] = await Promise.all([
          apiGet<VehicleTypePayload[]>('/vehicles/types'),
          isPlatform
            ? apiGet<OperatorOption[]>('/fleet/operators')
            : Promise.resolve<OperatorOption[]>([]),
        ]);
        if (cancelled) return;
        setTypes(typeRows);
        setOperators(operatorRows);
        setForm((current) => ({
          ...current,
          vehicleType: current.vehicleType || typeRows[0]?.code || 'OTHER',
          organizationId: current.organizationId || operatorRows[0]?.id || '',
        }));
        if (isEdit && vehicleId) {
          const vehicle = await apiGet<VehiclePayload>(`/vehicles/${vehicleId}`);
          if (cancelled) return;
          setForm(formFromVehicle(vehicle));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(formatApiError(cause, 'Unable to load vehicle form'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, isPlatform, vehicleId]);

  function update<K extends keyof VehicleFormState>(key: K, value: VehicleFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messages = validateVehicleForm(form, isPlatform && !isEdit);
    if (messages.length > 0) {
      setError(messages[0] ?? 'Check the highlighted fields.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildVehiclePayload(form, isPlatform && !isEdit, isEdit);
      if (isEdit && vehicleId) {
        const vehicle = await apiPatch<VehiclePayload>(`/vehicles/${vehicleId}`, payload);
        notify(`${vehicle.reference} was updated.`);
        navigate(`/admin/vehicles/${vehicle.id}`);
        return;
      }
      const vehicle = await apiPost<VehiclePayload>('/vehicles', payload);
      notify(`${vehicle.reference} was created.`);
      navigate(`/admin/vehicles/${vehicle.id}`);
    } catch (cause) {
      setError(
        formatApiError(cause, isEdit ? 'Unable to update vehicle' : 'Unable to create vehicle'),
      );
      if (cause instanceof ApiError && cause.status === 409) {
        notify(cause.message, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!allowed) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        You do not have permission to manage vehicles.
      </p>
    );
  }
  if (loading) {
    return <p className="text-sm text-slate-500">Loading vehicle…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/vehicles">
          Back to vehicles
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Phase 6
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">
          {isEdit ? 'Edit vehicle' : 'Add vehicle'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Capture registration, capacity, and ownership details. Assignment to a shipment is
          reserved for a later phase.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">Vehicle profile</h2>
          {isPlatform && !isEdit ? (
            <Field label="Transporter organization" required>
              <select
                className={inputClass}
                value={form.organizationId}
                onChange={(event) => update('organizationId', event.target.value)}
              >
                {operators.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Vehicle type" required>
            <select
              className={inputClass}
              value={form.vehicleType}
              onChange={(event) => update('vehicleType', event.target.value)}
            >
              {types.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Registration / plate number" required>
            <input
              className={inputClass}
              value={form.registrationNumber}
              onChange={(event) => update('registrationNumber', event.target.value.toUpperCase())}
              placeholder="RAA 123 A"
              required
            />
          </Field>
          <Field label="Make">
            <input
              className={inputClass}
              value={form.make}
              onChange={(event) => update('make', event.target.value)}
            />
          </Field>
          <Field label="Model">
            <input
              className={inputClass}
              value={form.model}
              onChange={(event) => update('model', event.target.value)}
            />
          </Field>
          <Field label="Year">
            <input
              className={inputClass}
              type="number"
              min={1980}
              max={new Date().getUTCFullYear() + 1}
              value={form.year}
              onChange={(event) => update('year', event.target.value)}
            />
          </Field>
          <Field label="Color">
            <input
              className={inputClass}
              value={form.color}
              onChange={(event) => update('color', event.target.value)}
            />
          </Field>
          <Field label="VIN / chassis number">
            <input
              className={inputClass}
              value={form.vin}
              onChange={(event) => update('vin', event.target.value)}
            />
          </Field>
          <Field label="Engine number">
            <input
              className={inputClass}
              value={form.engineNumber}
              onChange={(event) => update('engineNumber', event.target.value)}
            />
          </Field>
        </section>

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">
            Capacity and ownership
          </h2>
          <Field label="Maximum payload">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.001"
              value={form.payloadCapacity}
              onChange={(event) => update('payloadCapacity', event.target.value)}
            />
          </Field>
          <Field label="Payload unit">
            <select
              className={inputClass}
              value={form.payloadUnit}
              onChange={(event) => update('payloadUnit', event.target.value)}
            >
              {payloadUnitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Length (m)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={form.lengthM}
              onChange={(event) => update('lengthM', event.target.value)}
            />
          </Field>
          <Field label="Width (m)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={form.widthM}
              onChange={(event) => update('widthM', event.target.value)}
            />
          </Field>
          <Field label="Height (m)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={form.heightM}
              onChange={(event) => update('heightM', event.target.value)}
            />
          </Field>
          <Field label="Fuel type">
            <select
              className={inputClass}
              value={form.fuelType}
              onChange={(event) => update('fuelType', event.target.value)}
            >
              <option value="">Not specified</option>
              {fuelTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ownership">
            <select
              className={inputClass}
              value={form.ownershipType}
              onChange={(event) => update('ownershipType', event.target.value)}
            >
              {ownershipOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {!isEdit ? (
            <Field label="Initial status">
              <select
                className={inputClass}
                value={form.status}
                onChange={(event) => update('status', event.target.value)}
              >
                <option value="ACTIVE">Active</option>
                <option value="AVAILABLE">Available</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          ) : null}
          <label className="text-sm font-medium md:col-span-2">
            Notes
            <textarea
              className={inputClass}
              rows={3}
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
            />
          </label>
        </section>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            className="rounded-md bg-[#12355b] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2743] disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create vehicle'}
          </button>
          <Link className="rounded-md border px-4 py-2 text-sm" to="/admin/vehicles">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function formFromVehicle(vehicle: VehiclePayload): VehicleFormState {
  return {
    organizationId: vehicle.organizationId,
    vehicleType: vehicle.vehicleType,
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year != null ? String(vehicle.year) : '',
    color: vehicle.color ?? '',
    vin: vehicle.vin ?? '',
    engineNumber: vehicle.engineNumber ?? '',
    payloadCapacity: vehicle.payloadCapacity != null ? String(vehicle.payloadCapacity) : '',
    payloadUnit: vehicle.payloadUnit,
    lengthM: vehicle.lengthM != null ? String(vehicle.lengthM) : '',
    widthM: vehicle.widthM != null ? String(vehicle.widthM) : '',
    heightM: vehicle.heightM != null ? String(vehicle.heightM) : '',
    fuelType: vehicle.fuelType ?? '',
    ownershipType: vehicle.ownershipType,
    status: vehicle.status,
    notes: vehicle.notes ?? '',
  };
}

function buildVehiclePayload(
  form: VehicleFormState,
  includeOrganization: boolean,
  isEdit: boolean,
) {
  return {
    organizationId: includeOrganization ? form.organizationId || undefined : undefined,
    vehicleType: form.vehicleType,
    registrationNumber: form.registrationNumber.trim(),
    make: form.make.trim() || undefined,
    model: form.model.trim() || undefined,
    year: optionalNumber(form.year),
    color: form.color.trim() || undefined,
    vin: form.vin.trim() || undefined,
    engineNumber: form.engineNumber.trim() || undefined,
    payloadCapacity: optionalNumber(form.payloadCapacity),
    payloadUnit: form.payloadUnit,
    lengthM: optionalNumber(form.lengthM),
    widthM: optionalNumber(form.widthM),
    heightM: optionalNumber(form.heightM),
    fuelType: form.fuelType || undefined,
    ownershipType: form.ownershipType,
    notes: form.notes.trim() || undefined,
    ...(isEdit ? {} : { status: form.status || undefined }),
  };
}

function validateVehicleForm(form: VehicleFormState, requireOrganization: boolean) {
  const errors: string[] = [];
  if (requireOrganization && !form.organizationId) {
    errors.push('Transporter organization is required.');
  }
  if (!form.vehicleType) {
    errors.push('Vehicle type is required.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9\s-]{1,18}[A-Za-z0-9]$/.test(form.registrationNumber.trim())) {
    errors.push('Enter a valid registration or plate number.');
  }
  const year = optionalNumber(form.year);
  if (form.year.trim() && (year == null || Number.isNaN(year) || year < 1980)) {
    errors.push('Year must be 1980 or later.');
  }
  const capacity = optionalNumber(form.payloadCapacity);
  if (form.payloadCapacity.trim() && (capacity == null || Number.isNaN(capacity) || capacity < 0)) {
    errors.push('Capacity cannot be negative.');
  }
  return errors;
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
