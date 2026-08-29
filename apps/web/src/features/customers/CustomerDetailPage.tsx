import type { CustomerPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiGet } from '../../shared/api/client';

export function CustomerDetailPage() {
  const { customerId } = useParams();
  const [customer, setCustomer] = useState<CustomerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) {
      return;
    }
    apiGet<CustomerPayload>(`/customers/${customerId}`)
      .then(setCustomer)
      .catch((cause) =>
        setError(cause instanceof ApiError ? cause.message : 'Unable to load customer'),
      );
  }, [customerId]);

  if (error) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }
  if (!customer) {
    return <p className="text-sm text-slate-500">Loading customer…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/customers">
          Back to customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[#12355b]">{customer.name}</h1>
        <p className="text-sm text-slate-600">
          {customer.countryCode} · {customer.defaultCurrencyCode} · {customer.status}
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Contacts</h2>
        {customer.contacts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No contacts.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {customer.contacts.map((contact) => (
              <li key={contact.id}>
                {contact.firstName} {contact.lastName}
                {contact.email ? ` · ${contact.email}` : ''}
                {contact.isPrimary ? ' · Primary' : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Addresses</h2>
        {customer.addresses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No addresses.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {customer.addresses.map((address) => (
              <li key={address.id}>{address.formattedAddress}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
