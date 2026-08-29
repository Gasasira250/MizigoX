import type { CustomerPayload } from '@mizigox/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiGet, apiPost } from '../../shared/api/client';

export function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerPayload[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [street, setStreet] = useState('');
  const [district, setDistrict] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load(search = query) {
    try {
      const data = await apiGet<CustomerPayload[]>(`/customers?q=${encodeURIComponent(search)}`);
      setCustomers(data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load customers');
    }
  }

  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const [firstName, ...rest] = contactName.trim().split(' ');
    try {
      await apiPost('/customers', {
        name,
        email: email || undefined,
        countryCode: 'RW',
        primaryContact: firstName
          ? { firstName, lastName: rest.join(' ') || firstName }
          : undefined,
        primaryAddress: street
          ? { countryCode: 'RW', streetLine1: street, adminArea2: district || undefined }
          : undefined,
      });
      setShowForm(false);
      setName('');
      setEmail('');
      setContactName('');
      setStreet('');
      setDistrict('');
      await load('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to create customer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 3</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Customers</h1>
          <p className="mt-2 text-sm text-slate-600">
            Customer organizations stored in PostgreSQL.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-[#12355b] px-4 py-2 text-sm font-medium text-white"
          onClick={() => setShowForm(true)}
        >
          New customer
        </button>
      </div>

      {showForm ? (
        <form
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2"
          onSubmit={(event) => void onSubmit(event)}
        >
          <label className="text-sm font-medium">
            Organization name
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Email
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Primary contact
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Jean Habimana"
            />
          </label>
          <label className="text-sm font-medium">
            District
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Gasabo"
            />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Street address
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button
              className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Saving…' : 'Create customer'}
            </button>
            <button
              className="rounded-md border px-4 py-2 text-sm"
              type="button"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex gap-2">
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search customers"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="rounded-md border px-3 py-2 text-sm"
          type="button"
          onClick={() => void load()}
        >
          Search
        </button>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium">Currency</th>
              <th className="px-4 py-3 font-medium">Contacts</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={4}>
                  No customers yet.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-[#12355b] hover:underline"
                      to={`/admin/customers/${customer.id}`}
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{customer.countryCode}</td>
                  <td className="px-4 py-3">{customer.defaultCurrencyCode}</td>
                  <td className="px-4 py-3">{customer.contacts.length}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
