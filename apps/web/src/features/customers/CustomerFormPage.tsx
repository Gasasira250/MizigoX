import {
  ADDRESS_TYPES,
  addressTypeLabel,
  canCreateCustomers,
  canUpdateCustomers,
  type CustomerPayload,
} from '@mizigox/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiGet, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { useToast } from '../../shared/ui/ToastProvider';
import {
  buildCreatePayload,
  buildUpdatePayload,
  countryOptions,
  customerTypeOptions,
  emptyCustomerForm,
  formFromCustomer,
  formatApiError,
  validateCustomerForm,
  type CustomerFormState,
} from './form-utils';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function CustomerFormPage() {
  const { customerId } = useParams();
  const isEdit = Boolean(customerId && UUID_PATTERN.test(customerId));
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const allowed = isEdit
    ? canUpdateCustomers(user?.permissions)
    : canCreateCustomers(user?.permissions);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isEdit || !customerId) {
      return;
    }
    apiGet<CustomerPayload>(`/customers/${customerId}`)
      .then((customer) => setForm(formFromCustomer(customer)))
      .catch((cause) => setError(formatApiError(cause, 'Unable to load customer')))
      .finally(() => setLoading(false));
  }, [customerId, isEdit]);

  function update<K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messages = validateCustomerForm(form, !isEdit);
    if (messages.length > 0) {
      setError(messages[0] ?? 'Check the highlighted fields.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && customerId) {
        const customer = await apiPatch<CustomerPayload>(
          `/customers/${customerId}`,
          buildUpdatePayload(form),
        );
        notify(`${customer.name} was updated.`);
        navigate(`/admin/customers/${customer.id}`);
        return;
      }
      const customer = await apiPost<CustomerPayload>('/customers', buildCreatePayload(form));
      notify(`${customer.name} was created.`);
      navigate(`/admin/customers/${customer.id}`);
    } catch (cause) {
      setError(
        formatApiError(cause, isEdit ? 'Unable to update customer' : 'Unable to create customer'),
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
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">You cannot do this.</p>
    );
  }
  if (loading) {
    return <p className="text-sm text-slate-500">Loading customer…</p>;
  }

  const rwanda = form.countryCode === 'RW';

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/customers">
          Back to customers
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Phase 4
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">
          {isEdit ? 'Edit customer' : 'Add customer'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Capture the business profile, primary contact, and a service address. Additional contacts
          and locations can be managed from the customer record.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">Customer profile</h2>
          <Field label="Company / business name" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              required
            />
          </Field>
          <Field label="Customer type" required>
            <select
              className={inputClass}
              value={form.customerType}
              onChange={(event) => update('customerType', event.target.value)}
            >
              {customerTypeOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Legal / registered name">
            <input
              className={inputClass}
              value={form.legalName}
              onChange={(event) => update('legalName', event.target.value)}
            />
          </Field>
          <Field label="Registration number">
            <input
              className={inputClass}
              value={form.registrationNumber}
              onChange={(event) => update('registrationNumber', event.target.value)}
            />
          </Field>
          <Field label="Tax identification number">
            <input
              className={inputClass}
              value={form.taxId}
              onChange={(event) => update('taxId', event.target.value)}
            />
          </Field>
          <Field label="Website">
            <input
              className={inputClass}
              value={form.website}
              onChange={(event) => update('website', event.target.value)}
              placeholder="https://company.rw"
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
          <Field label="Phone">
            <input
              className={inputClass}
              value={form.phoneE164}
              onChange={(event) => update('phoneE164', event.target.value)}
              placeholder="+250788123456"
            />
          </Field>
          <Field label="Country" required>
            <select
              className={inputClass}
              value={form.countryCode}
              onChange={(event) => update('countryCode', event.target.value)}
            >
              {countryOptions().map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City">
            <input
              className={inputClass}
              value={form.city}
              onChange={(event) => update('city', event.target.value)}
            />
          </Field>
          <label className="text-sm font-medium md:col-span-2">
            Notes
            <textarea
              className={`${inputClass} min-h-24`}
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
            />
          </label>
        </section>

        {!isEdit ? (
          <>
            <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
              <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">
                Primary contact
              </h2>
              <Field label="First name" required>
                <input
                  className={inputClass}
                  value={form.contactFirstName}
                  onChange={(event) => update('contactFirstName', event.target.value)}
                  required
                />
              </Field>
              <Field label="Last name" required>
                <input
                  className={inputClass}
                  value={form.contactLastName}
                  onChange={(event) => update('contactLastName', event.target.value)}
                  required
                />
              </Field>
              <Field label="Job title">
                <input
                  className={inputClass}
                  value={form.contactJobTitle}
                  onChange={(event) => update('contactJobTitle', event.target.value)}
                />
              </Field>
              <Field label="Contact phone">
                <input
                  className={inputClass}
                  value={form.contactPhone}
                  onChange={(event) => update('contactPhone', event.target.value)}
                  placeholder="+250788123456"
                />
              </Field>
              <Field label="Contact email">
                <input
                  className={inputClass}
                  type="email"
                  value={form.contactEmail}
                  onChange={(event) => update('contactEmail', event.target.value)}
                />
              </Field>
            </section>

            <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
              <h2 className="text-sm font-semibold text-[#12355b] md:col-span-2">
                Primary address
              </h2>
              <Field label="Address type">
                <select
                  className={inputClass}
                  value={form.addressType}
                  onChange={(event) => update('addressType', event.target.value)}
                >
                  {ADDRESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {addressTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={rwanda ? 'Province' : 'Province / region'}>
                <input
                  className={inputClass}
                  value={form.adminArea1}
                  onChange={(event) => update('adminArea1', event.target.value)}
                />
              </Field>
              <Field label={rwanda ? 'District' : 'District / city'}>
                <input
                  className={inputClass}
                  value={form.adminArea2}
                  onChange={(event) => update('adminArea2', event.target.value)}
                />
              </Field>
              <Field label={rwanda ? 'Sector / area' : 'Area'}>
                <input
                  className={inputClass}
                  value={form.subLocality}
                  onChange={(event) => update('subLocality', event.target.value)}
                />
              </Field>
              <Field label="Street / address details">
                <input
                  className={inputClass}
                  value={form.streetLine1}
                  onChange={(event) => update('streetLine1', event.target.value)}
                />
              </Field>
              <Field label="Address line 2">
                <input
                  className={inputClass}
                  value={form.streetLine2}
                  onChange={(event) => update('streetLine2', event.target.value)}
                />
              </Field>
              <Field label="Landmark">
                <input
                  className={inputClass}
                  value={form.landmark}
                  onChange={(event) => update('landmark', event.target.value)}
                />
              </Field>
            </section>
          </>
        ) : (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Contacts and addresses are managed from the customer profile so each record stays
            unique.
          </p>
        )}

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
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
          </button>
          <Link className="rounded-md border px-4 py-2 text-sm" to="/admin/customers">
            Cancel
          </Link>
        </div>
      </form>
    </div>
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
