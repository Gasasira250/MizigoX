import { COUNTRIES, canCreateDrivers, canUpdateDrivers, type DriverPayload } from '@mizigox/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiGet, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { useToast } from '../../shared/ui/ToastProvider';
import { UUID_PATTERN, formatApiError } from '../fleet/form-utils';

interface OperatorOption {
  id: string;
  name: string;
  countryCode: string;
}

interface LinkableUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

const emptyForm = {
  organizationId: '',
  userId: '',
  firstName: '',
  lastName: '',
  phoneE164: '',
  email: '',
  dateOfBirth: '',
  licenseNumber: '',
  licenseCategory: '',
  licenseIssuedAt: '',
  licenseExpiresAt: '',
  nationalityCountryCode: 'RW',
  emergencyContactName: '',
  emergencyContactPhone: '',
  status: 'ACTIVE',
  notes: '',
};

type DriverFormState = typeof emptyForm;

export function DriverFormPage() {
  const { driverId } = useParams();
  const isEdit = Boolean(driverId && UUID_PATTERN.test(driverId));
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const isPlatform = user?.organization.type === 'PLATFORM';
  const allowed = isEdit
    ? canUpdateDrivers(user?.permissions)
    : canCreateDrivers(user?.permissions);
  const [form, setForm] = useState<DriverFormState>(emptyForm);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<LinkableUser[]>([]);
  const [linkedUserLabel, setLinkedUserLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const operatorRows = isPlatform ? await apiGet<OperatorOption[]>('/fleet/operators') : [];
        if (cancelled) return;
        setOperators(operatorRows);
        const organizationId = isPlatform
          ? operatorRows.length === 1
            ? operatorRows[0]?.id || ''
            : ''
          : user?.organization.id || '';
        setForm((current) => ({
          ...current,
          organizationId: current.organizationId || organizationId,
        }));
        if (isEdit && driverId) {
          const driver = await apiGet<DriverPayload>(`/drivers/${driverId}`);
          if (cancelled) return;
          setForm(formFromDriver(driver));
          if (driver.userId) {
            setLinkedUserLabel(driver.userEmail ?? driver.userId);
          }
          await loadLinkable(driver.organizationId);
        } else if (organizationId) {
          await loadLinkable(organizationId);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(formatApiError(cause, 'Unable to load driver form'));
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
  }, [driverId, isEdit, isPlatform, user?.organization.id]);

  async function loadLinkable(organizationId?: string) {
    const params = organizationId ? `?organizationId=${organizationId}` : '';
    const users = await apiGet<LinkableUser[]>(`/drivers/linkable-users${params}`);
    setLinkableUsers(users);
  }

  function update<K extends keyof DriverFormState>(key: K, value: DriverFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onOrganizationChange(organizationId: string) {
    update('organizationId', organizationId);
    update('userId', '');
    if (!organizationId) {
      setLinkableUsers([]);
      return;
    }
    try {
      await loadLinkable(organizationId);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load linkable users'));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messages = validateDriverForm(form, isPlatform && !isEdit);
    if (messages.length > 0) {
      setError(messages[0] ?? 'Check the highlighted fields.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildDriverPayload(form, isPlatform && !isEdit, isEdit);
      if (isEdit && driverId) {
        const driver = await apiPatch<DriverPayload>(`/drivers/${driverId}`, payload);
        notify(`${driver.reference} was updated.`);
        navigate(`/admin/drivers/${driver.id}`);
        return;
      }
      const driver = await apiPost<DriverPayload>('/drivers', payload);
      notify(`${driver.reference} was created.`);
      navigate(`/admin/drivers/${driver.id}`);
    } catch (cause) {
      setError(
        formatApiError(cause, isEdit ? 'Unable to update driver' : 'Unable to create driver'),
      );
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 422)) {
        notify(cause.message, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!allowed) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        You do not have permission to manage drivers.
      </p>
    );
  }
  if (loading) {
    return <p className="text-sm text-slate-500">Loading driver…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/drivers">
          Back to drivers
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Phase 6
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">
          {isEdit ? 'Edit driver' : 'Add driver'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Record operational driver details and optionally link an existing authenticated user. Do
          not collect extra personal data that is not needed to operate the fleet.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">Driver profile</h2>
          {isPlatform && !isEdit ? (
            <Field label="Transporter organization" required>
              <select
                className={inputClass}
                value={form.organizationId}
                onChange={(event) => void onOrganizationChange(event.target.value)}
                required
              >
                <option value="">Select transporter</option>
                {operators.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="First name" required>
            <input
              className={inputClass}
              value={form.firstName}
              onChange={(event) => update('firstName', event.target.value)}
              required
            />
          </Field>
          <Field label="Last name" required>
            <input
              className={inputClass}
              value={form.lastName}
              onChange={(event) => update('lastName', event.target.value)}
              required
            />
          </Field>
          <Field label="Phone" required>
            <input
              className={inputClass}
              value={form.phoneE164}
              onChange={(event) => update('phoneE164', event.target.value)}
              placeholder="+250788123456"
              required
            />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
            />
          </Field>
          <Field label="Date of birth">
            <input
              className={inputClass}
              type="date"
              value={form.dateOfBirth}
              onChange={(event) => update('dateOfBirth', event.target.value)}
            />
          </Field>
          <Field label="Nationality">
            <select
              className={inputClass}
              value={form.nationalityCountryCode}
              onChange={(event) => update('nationalityCountryCode', event.target.value)}
            >
              <option value="">Not specified</option>
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Linked user account">
            <select
              className={inputClass}
              value={form.userId}
              onChange={(event) => update('userId', event.target.value)}
            >
              <option value="">No linked account</option>
              {linkedUserLabel && form.userId ? (
                <option value={form.userId}>{linkedUserLabel} (current)</option>
              ) : null}
              {linkableUsers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.firstName} {item.lastName} · {item.email}
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
                <option value="OFF_DUTY">Off duty</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          ) : null}
        </section>

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">
            License and emergency contact
          </h2>
          <Field label="License number">
            <input
              className={inputClass}
              value={form.licenseNumber}
              onChange={(event) => update('licenseNumber', event.target.value)}
            />
          </Field>
          <Field label="License category / class">
            <input
              className={inputClass}
              value={form.licenseCategory}
              onChange={(event) => update('licenseCategory', event.target.value)}
              placeholder="B, C, CE"
            />
          </Field>
          <Field label="License issue date">
            <input
              className={inputClass}
              type="date"
              value={form.licenseIssuedAt}
              onChange={(event) => update('licenseIssuedAt', event.target.value)}
            />
          </Field>
          <Field label="License expiry date">
            <input
              className={inputClass}
              type="date"
              value={form.licenseExpiresAt}
              onChange={(event) => update('licenseExpiresAt', event.target.value)}
            />
          </Field>
          <Field label="Emergency contact">
            <input
              className={inputClass}
              value={form.emergencyContactName}
              onChange={(event) => update('emergencyContactName', event.target.value)}
            />
          </Field>
          <Field label="Emergency contact phone">
            <input
              className={inputClass}
              value={form.emergencyContactPhone}
              onChange={(event) => update('emergencyContactPhone', event.target.value)}
              placeholder="+250788123456"
            />
          </Field>
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
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create driver'}
          </button>
          <Link className="rounded-md border px-4 py-2 text-sm" to="/admin/drivers">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function formFromDriver(driver: DriverPayload): DriverFormState {
  return {
    organizationId: driver.organizationId,
    userId: driver.userId ?? '',
    firstName: driver.firstName,
    lastName: driver.lastName,
    phoneE164: driver.phoneE164,
    email: driver.email ?? '',
    dateOfBirth: driver.dateOfBirth ?? '',
    licenseNumber: driver.licenseNumber ?? '',
    licenseCategory: driver.licenseCategory ?? '',
    licenseIssuedAt: driver.licenseIssuedAt ?? '',
    licenseExpiresAt: driver.licenseExpiresAt ?? '',
    nationalityCountryCode: driver.nationalityCountryCode ?? '',
    emergencyContactName: driver.emergencyContactName ?? '',
    emergencyContactPhone: driver.emergencyContactPhone ?? '',
    status: driver.status,
    notes: driver.notes ?? '',
  };
}

function buildDriverPayload(form: DriverFormState, includeOrganization: boolean, isEdit: boolean) {
  return {
    organizationId: includeOrganization ? form.organizationId || undefined : undefined,
    userId: isEdit ? form.userId || null : form.userId || undefined,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    phoneE164: form.phoneE164.trim(),
    email: form.email.trim() || undefined,
    dateOfBirth: form.dateOfBirth || undefined,
    licenseNumber: form.licenseNumber.trim() || undefined,
    licenseCategory: form.licenseCategory.trim() || undefined,
    licenseIssuedAt: form.licenseIssuedAt || undefined,
    licenseExpiresAt: form.licenseExpiresAt || undefined,
    nationalityCountryCode: form.nationalityCountryCode || undefined,
    emergencyContactName: form.emergencyContactName.trim() || undefined,
    emergencyContactPhone: form.emergencyContactPhone.trim() || undefined,
    notes: form.notes.trim() || undefined,
    ...(isEdit ? {} : { status: form.status || undefined }),
  };
}

function validateDriverForm(form: DriverFormState, requireOrganization: boolean) {
  const errors: string[] = [];
  if (requireOrganization && !form.organizationId) {
    errors.push('Transporter organization is required.');
  }
  if (!form.firstName.trim() || !form.lastName.trim()) {
    errors.push('First and last name are required.');
  }
  if (!/^\+[1-9]\d{6,14}$/.test(form.phoneE164.trim())) {
    errors.push('Phone must use international format, for example +250788123456.');
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.push('Enter a valid email address.');
  }
  if (form.emergencyContactPhone && !/^\+[1-9]\d{6,14}$/.test(form.emergencyContactPhone)) {
    errors.push('Emergency contact phone must use international format.');
  }
  if (
    form.licenseIssuedAt &&
    form.licenseExpiresAt &&
    form.licenseExpiresAt < form.licenseIssuedAt
  ) {
    errors.push('License expiry cannot be before the issue date.');
  }
  if (form.dateOfBirth) {
    const birth = new Date(`${form.dateOfBirth}T00:00:00.000Z`);
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
    if (birth > cutoff) {
      errors.push('Driver must be at least 18 years old.');
    }
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
