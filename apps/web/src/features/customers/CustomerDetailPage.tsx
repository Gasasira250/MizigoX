import type {
  AddressPayload,
  ContactPayload,
  CustomerBalancePayload,
  CustomerPayload,
  InvoicePayload,
  ShipmentPayload,
} from '@mizigox/shared';
import {
  ADDRESS_TYPES,
  addressTypeLabel,
  canDeleteCustomers,
  canReadFinance,
  canReadInvoices,
  canReadShipments,
  canUpdateCustomers,
  CONTACT_STATUSES,
  customerStatusLabel,
  customerTypeLabel,
} from '@mizigox/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { countryOptions, formatApiError, formatDate, locationLabel } from './form-utils';
import { formatMoney } from '../billing/format';

type ConfirmState =
  | { type: 'deactivate' }
  | { type: 'activate' }
  | { type: 'archive' }
  | { type: 'contact'; id: string }
  | { type: 'address'; id: string }
  | null;

export function CustomerDetailPage() {
  const { customerId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canUpdate = canUpdateCustomers(user?.permissions);
  const canDelete = canDeleteCustomers(user?.permissions);
  const canFinance = canReadInvoices(user?.permissions) || canReadFinance(user?.permissions);
  const [customer, setCustomer] = useState<CustomerPayload | null>(null);
  const [balance, setBalance] = useState<CustomerBalancePayload | null>(null);
  const [outstanding, setOutstanding] = useState<InvoicePayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  async function load() {
    if (!customerId || !/^[0-9a-f-]{36}$/i.test(customerId)) {
      setError('Customer not found');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setCustomer(await apiGet<CustomerPayload>(`/customers/${customerId}`));
      setError(null);
      if (canFinance) {
        const [nextBalance, nextOutstanding] = await Promise.all([
          apiGet<CustomerBalancePayload>(`/customers/${customerId}/balance`),
          apiGet<InvoicePayload[]>(`/customers/${customerId}/outstanding-invoices`).catch(() => []),
        ]);
        setBalance(nextBalance);
        setOutstanding(nextOutstanding);
      }
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load customer'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function runConfirmed() {
    if (!customer || !confirm) {
      return;
    }
    try {
      if (confirm.type === 'activate' || confirm.type === 'deactivate') {
        const updated = await apiPost<CustomerPayload>(`/customers/${customer.id}/${confirm.type}`);
        setCustomer(updated);
        notify(`${updated.name} is now ${customerStatusLabel(updated.status).toLowerCase()}.`);
      } else if (confirm.type === 'archive') {
        await apiDelete(`/customers/${customer.id}`);
        notify(`${customer.name} was archived.`);
        navigate('/admin/customers');
      } else if (confirm.type === 'contact') {
        await apiDelete(`/customers/${customer.id}/contacts/${confirm.id}`);
        notify('Contact removed.');
        await load();
      } else {
        await apiDelete(`/customers/${customer.id}/addresses/${confirm.id}`);
        notify('Address removed.');
        await load();
      }
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to complete that action'), 'error');
    } finally {
      setConfirm(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading customer…</p>;
  }
  if (error || !customer) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? 'Customer not found'}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link className="text-sm text-teal-800 hover:underline" to="/admin/customers">
            Back to customers
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-[#12355b]">{customer.name}</h1>
            <StatusBadge status={customer.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {customer.customerReference} · {customerTypeLabel(customer.customerType)} ·{' '}
            {locationLabel(customer)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpdate ? (
            <>
              <Link
                className="rounded-md bg-[#12355b] px-3 py-2 text-sm font-medium text-white"
                to={`/admin/customers/${customer.id}/edit`}
              >
                Edit customer
              </Link>
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() =>
                  setConfirm({ type: customer.status === 'ACTIVE' ? 'deactivate' : 'activate' })
                }
              >
                {customer.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </button>
            </>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700"
              onClick={() => setConfirm({ type: 'archive' })}
            >
              Archive
            </button>
          ) : null}
        </div>
      </div>

      {balance ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#12355b]">Financial summary</h2>
            <Link
              className="text-sm text-teal-800 hover:underline"
              to={`/admin/invoices?customerId=${customer.id}`}
            >
              View invoices
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <OverviewCard
              label="Total invoiced"
              value={formatMoney(balance.totalInvoiced, balance.currencyCode)}
            />
            <OverviewCard
              label="Total paid"
              value={formatMoney(balance.totalPaid, balance.currencyCode)}
            />
            <OverviewCard
              label="Outstanding"
              value={formatMoney(balance.outstandingBalance, balance.currencyCode)}
            />
            <OverviewCard
              label="Overdue"
              value={formatMoney(balance.overdueAmount, balance.currencyCode)}
            />
          </div>
          {outstanding.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm">
              {outstanding.slice(0, 5).map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    className="text-teal-800 hover:underline"
                    to={`/admin/invoices/${invoice.id}`}
                  >
                    {invoice.number}
                  </Link>{' '}
                  · {formatMoney(invoice.amountDue, invoice.currencyCode)} due
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Primary contact" value={customer.primaryContactName ?? 'Not set'} />
        <OverviewCard label="Phone" value={customer.phoneE164 ?? 'Not set'} />
        <OverviewCard label="Email" value={customer.email ?? 'Not set'} />
        <OverviewCard label="Created" value={formatDate(customer.createdAt)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Overview</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Item label="Legal name" value={customer.legalName} />
            <Item label="Registration no." value={customer.registrationNumber} />
            <Item label="Tax ID" value={customer.taxId} />
            <Item label="Website" value={customer.website} />
            <Item label="Country" value={customer.countryCode} />
            <Item label="City" value={customer.city} />
            <Item label="Created by" value={customer.createdByName} />
            <Item label="Last updated" value={formatDate(customer.updatedAt)} />
          </dl>
          {customer.notes ? <p className="mt-4 text-sm text-slate-600">{customer.notes}</p> : null}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Contact information</h2>
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <p>{customer.email ?? 'No company email'}</p>
            <p>{customer.phoneE164 ?? 'No company phone'}</p>
            <p>{customer.website ?? 'No website'}</p>
            <p>{locationLabel(customer)}</p>
          </div>
        </article>
      </section>

      <ContactsSection
        customer={customer}
        canUpdate={canUpdate}
        onChanged={load}
        onDelete={(id) => setConfirm({ type: 'contact', id })}
      />
      <AddressesSection
        customer={customer}
        canUpdate={canUpdate}
        onChanged={load}
        onDelete={(id) => setConfirm({ type: 'address', id })}
      />

      <CustomerShipments customerId={customer.id} />

      {confirm ? (
        <ConfirmDialog
          title={confirmTitle(confirm, customer)}
          message={confirmMessage(confirm, customer)}
          confirmLabel={confirmLabel(confirm)}
          danger={
            confirm.type === 'archive' || confirm.type === 'contact' || confirm.type === 'address'
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            void runConfirmed();
          }}
        />
      ) : null}
    </div>
  );
}

function ContactsSection({
  customer,
  canUpdate,
  onChanged,
  onDelete,
}: {
  customer: CustomerPayload;
  canUpdate: boolean;
  onChanged: () => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const { notify } = useToast();
  const [editing, setEditing] = useState<Partial<ContactPayload> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing?.firstName || !editing.lastName) {
      notify('First and last name are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await apiPatch(`/customers/${customer.id}/contacts/${editing.id}`, editing);
        notify('Contact updated.');
      } else {
        await apiPost(`/customers/${customer.id}/contacts`, editing);
        notify('Contact added.');
      }
      setEditing(null);
      await onChanged();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to save contact'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#12355b]">Contacts</h2>
        {canUpdate ? (
          <button
            type="button"
            className="text-sm text-teal-800 hover:underline"
            onClick={() =>
              setEditing({
                firstName: '',
                lastName: '',
                jobTitle: '',
                email: '',
                phoneE164: '',
                isPrimary: customer.contacts.length === 0,
                status: 'ACTIVE',
              })
            }
          >
            Add contact
          </button>
        ) : null}
      </div>
      {customer.contacts.length === 0 && !editing ? (
        <p className="mt-3 text-sm text-slate-500">No contacts yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Title</th>
                <th className="py-2 pr-4 font-medium">Phone</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customer.contacts.map((contact) => (
                <tr key={contact.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4">
                    {contact.firstName} {contact.lastName}
                    {contact.isPrimary ? (
                      <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
                        Primary
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4">{contact.jobTitle ?? '—'}</td>
                  <td className="py-2 pr-4">{contact.phoneE164 ?? '—'}</td>
                  <td className="py-2 pr-4">{contact.email ?? '—'}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={contact.status} />
                  </td>
                  <td className="py-2">
                    {canUpdate ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-[#12355b] hover:underline"
                          onClick={() => setEditing(contact)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-700 hover:underline"
                          onClick={() => onDelete(contact.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <form
          className="mt-4 grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-2"
          onSubmit={(event) => void save(event)}
        >
          <input
            className={inputClass}
            placeholder="First name"
            value={editing.firstName ?? ''}
            onChange={(event) => setEditing({ ...editing, firstName: event.target.value })}
            required
          />
          <input
            className={inputClass}
            placeholder="Last name"
            value={editing.lastName ?? ''}
            onChange={(event) => setEditing({ ...editing, lastName: event.target.value })}
            required
          />
          <input
            className={inputClass}
            placeholder="Job title"
            value={editing.jobTitle ?? ''}
            onChange={(event) => setEditing({ ...editing, jobTitle: event.target.value })}
          />
          <input
            className={inputClass}
            placeholder="+250788123456"
            value={editing.phoneE164 ?? ''}
            onChange={(event) => setEditing({ ...editing, phoneE164: event.target.value })}
          />
          <input
            className={inputClass}
            type="email"
            placeholder="Email"
            value={editing.email ?? ''}
            onChange={(event) => setEditing({ ...editing, email: event.target.value })}
          />
          <select
            className={inputClass}
            value={editing.status ?? 'ACTIVE'}
            onChange={(event) => setEditing({ ...editing, status: event.target.value })}
          >
            {CONTACT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(editing.isPrimary)}
              onChange={(event) => setEditing({ ...editing, isPrimary: event.target.checked })}
            />
            Primary contact
          </label>
          <div className="flex gap-2">
            <button
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Saving…' : 'Save contact'}
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function AddressesSection({
  customer,
  canUpdate,
  onChanged,
  onDelete,
}: {
  customer: CustomerPayload;
  canUpdate: boolean;
  onChanged: () => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const { notify } = useToast();
  const [editing, setEditing] = useState<Partial<AddressPayload> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...editing,
        latitude: editing?.latitude === null ? undefined : editing?.latitude,
        longitude: editing?.longitude === null ? undefined : editing?.longitude,
      };
      if (editing?.id) {
        await apiPatch(`/customers/${customer.id}/addresses/${editing.id}`, payload);
        notify('Address updated.');
      } else {
        await apiPost(`/customers/${customer.id}/addresses`, {
          ...payload,
          countryCode: editing?.countryCode || customer.countryCode,
        });
        notify('Address added.');
      }
      setEditing(null);
      await onChanged();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to save address'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#12355b]">Addresses</h2>
        {canUpdate ? (
          <button
            type="button"
            className="text-sm text-teal-800 hover:underline"
            onClick={() =>
              setEditing({
                addressType: 'OFFICE',
                countryCode: customer.countryCode,
                isDefault: customer.addresses.length === 0,
              })
            }
          >
            Add address
          </button>
        ) : null}
      </div>
      {customer.addresses.length === 0 && !editing ? (
        <p className="mt-3 text-sm text-slate-500">No addresses yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {customer.addresses.map((address) => (
            <li key={address.id} className="rounded-md border border-slate-100 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800">
                    {addressTypeLabel(address.addressType)}
                    {address.isDefault ? ' · Default' : ''}
                  </p>
                  <p className="text-slate-600">{address.formattedAddress}</p>
                  {address.latitude !== null && address.longitude !== null ? (
                    <p className="text-xs text-slate-500">
                      {address.latitude}, {address.longitude}
                    </p>
                  ) : null}
                </div>
                {canUpdate ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-[#12355b] hover:underline"
                      onClick={() => setEditing(address)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-700 hover:underline"
                      onClick={() => onDelete(address.id)}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <form
          className="mt-4 grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-2"
          onSubmit={(event) => void save(event)}
        >
          <select
            className={inputClass}
            value={editing.addressType ?? 'OFFICE'}
            onChange={(event) => setEditing({ ...editing, addressType: event.target.value })}
          >
            {ADDRESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {addressTypeLabel(type)}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={editing.countryCode ?? customer.countryCode}
            onChange={(event) => setEditing({ ...editing, countryCode: event.target.value })}
          >
            {countryOptions().map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            placeholder="Province / region"
            value={editing.adminArea1 ?? ''}
            onChange={(event) => setEditing({ ...editing, adminArea1: event.target.value })}
          />
          <input
            className={inputClass}
            placeholder="District / city"
            value={editing.adminArea2 ?? ''}
            onChange={(event) => setEditing({ ...editing, adminArea2: event.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Sector / area"
            value={editing.subLocality ?? ''}
            onChange={(event) => setEditing({ ...editing, subLocality: event.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Street / address details"
            value={editing.streetLine1 ?? ''}
            onChange={(event) => setEditing({ ...editing, streetLine1: event.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Latitude"
            value={editing.latitude ?? ''}
            onChange={(event) =>
              setEditing({
                ...editing,
                latitude: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
          <input
            className={inputClass}
            placeholder="Longitude"
            value={editing.longitude ?? ''}
            onChange={(event) =>
              setEditing({
                ...editing,
                longitude: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(editing.isDefault)}
              onChange={(event) => setEditing({ ...editing, isDefault: event.target.checked })}
            />
            Default address
          </label>
          <div className="flex gap-2">
            <button
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Saving…' : 'Save address'}
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function CustomerShipments({ customerId }: { customerId: string }) {
  const { user } = useAuth();
  const canRead = canReadShipments(user?.permissions);
  const [shipments, setShipments] = useState<ShipmentPayload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(canRead);

  useEffect(() => {
    if (!canRead) {
      return;
    }
    apiGet<ShipmentPayload[]>(
      `/shipments?customerId=${customerId}&pageSize=8&sort=createdAt&order=desc`,
    )
      .then(setShipments)
      .catch((cause) => setError(formatApiError(cause, 'Unable to load shipments')))
      .finally(() => setLoading(false));
  }, [canRead, customerId]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#12355b]">Shipment history</h2>
        {canRead ? (
          <Link className="text-sm text-teal-800 hover:underline" to="/admin/shipments">
            View all shipments
          </Link>
        ) : null}
      </div>
      {!canRead ? (
        <p className="mt-3 text-sm text-slate-500">You do not have permission to view shipments.</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading shipments…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-700">{error}</p>
      ) : shipments.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No shipments booked for this customer yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Reference</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Priority</th>
                <th className="py-2 pr-4 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((shipment) => (
                <tr key={shipment.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4">
                    <Link
                      className="text-[#12355b] hover:underline"
                      to={`/admin/shipments/${shipment.id}`}
                    >
                      {shipment.reference}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={shipment.status} />
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={shipment.priority} />
                  </td>
                  <td className="py-2 text-slate-600">{formatDate(shipment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OverviewCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-800">{value}</p>
    </article>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-800">{value || '—'}</dd>
    </div>
  );
}

function confirmTitle(confirm: Exclude<ConfirmState, null>, customer: CustomerPayload) {
  if (confirm.type === 'archive') return `Archive ${customer.name}?`;
  if (confirm.type === 'deactivate') return `Deactivate ${customer.name}?`;
  if (confirm.type === 'activate') return `Activate ${customer.name}?`;
  if (confirm.type === 'contact') return 'Remove this contact?';
  return 'Remove this address?';
}

function confirmMessage(confirm: Exclude<ConfirmState, null>, customer: CustomerPayload) {
  if (confirm.type === 'archive') {
    return `${customer.name} will be archived and hidden from the customer list. Historical records stay in the database.`;
  }
  if (confirm.type === 'deactivate') {
    return 'Inactive customers remain visible but are marked as not currently trading.';
  }
  if (confirm.type === 'activate') {
    return 'This customer will be marked active again.';
  }
  return 'This record will be archived and no longer shown on the profile.';
}

function confirmLabel(confirm: Exclude<ConfirmState, null>) {
  if (confirm.type === 'archive') return 'Archive';
  if (confirm.type === 'deactivate') return 'Deactivate';
  if (confirm.type === 'activate') return 'Activate';
  return 'Remove';
}

const inputClass = 'rounded-md border border-slate-300 px-3 py-2 text-sm';
