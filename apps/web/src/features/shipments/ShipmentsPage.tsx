import type { CustomerPayload, ShipmentPayload, ShipmentStatus } from '@mizigox/shared';
import { SHIPMENT_STATUSES } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiGet } from '../../shared/api/client';
import { StatusBadge } from '../../shared/ui/StatusBadge';

export function ShipmentsPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const [shipments, setShipments] = useState<ShipmentPayload[]>([]);
  const [customers, setCustomers] = useState<CustomerPayload[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ShipmentStatus | ''>('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (status) params.set('status', status);
      const data = await apiGet<ShipmentPayload[]>(`/shipments?${params.toString()}`);
      setShipments(data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load shipments');
    }
  }

  useEffect(() => {
    void load();
    if (basePath === '/admin') {
      apiGet<CustomerPayload[]>('/customers')
        .then(setCustomers)
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 3</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Shipments</h1>
          <p className="mt-2 text-sm text-slate-600">
            Live bookings with MX-RW references. {customers.length > 0 ? `${customers.length} customers available.` : ''}
          </p>
        </div>
        <Link className="rounded-md bg-[#12355b] px-4 py-2 text-sm font-medium text-white" to={`${basePath}/shipments/new`}>
          New shipment
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search reference, customer, or cargo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as ShipmentStatus | '')}
        >
          <option value="">All statuses</option>
          {SHIPMENT_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => void load()}>
          Filter
        </button>
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Origin</th>
              <th className="px-4 py-3 font-medium">Destination</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shipments.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No shipments found.
                </td>
              </tr>
            ) : (
              shipments.map((shipment) => (
                <tr key={shipment.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link className="font-medium text-[#12355b] hover:underline" to={`${basePath}/shipments/${shipment.id}`}>
                      {shipment.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{shipment.customerName}</td>
                  <td className="px-4 py-3">{shipment.origin?.formattedAddress ?? shipment.originCountryCode}</td>
                  <td className="px-4 py-3">
                    {shipment.destination?.formattedAddress ?? shipment.destinationCountryCode}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={shipment.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
