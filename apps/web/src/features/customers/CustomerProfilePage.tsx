import type { CustomerPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { apiGet } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';

export function CustomerProfilePage() {
  const [customer, setCustomer] = useState<CustomerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<CustomerPayload>('/me/customer-profile')
      .then(setCustomer)
      .catch((cause) => setError(formatAppError(cause, 'Unable to load company profile')));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!customer) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title={customer.name} description="Company information for your customer account." />
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p>Legal name: {customer.legalName ?? '—'}</p>
        <p>Email: {customer.email ?? '—'}</p>
        <p>Phone: {customer.phoneE164 ?? '—'}</p>
        <p>Country: {customer.countryCode}</p>
        <p>City: {customer.city ?? '—'}</p>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Contacts</h2>
        {customer.contacts.length === 0 ? (
          <EmptyState title="No contacts listed." />
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {customer.contacts.map((contact) => (
              <li key={contact.id}>
                {contact.firstName} {contact.lastName}
                {contact.email ? ` · ${contact.email}` : ''}
                {contact.phoneE164 ? ` · ${contact.phoneE164}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Addresses</h2>
        {customer.addresses.length === 0 ? (
          <EmptyState title="No addresses listed." />
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
