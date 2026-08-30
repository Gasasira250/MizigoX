import type {
  CustomerPayload,
  ShipmentPayload,
  ShipmentPriority,
  ShipmentSortField,
  ShipmentStatus,
} from '@mizigox/shared';
import {
  SHIPMENT_PRIORITIES,
  SHIPMENT_STATUSES,
  canCreateShipments,
  canUpdateShipments,
  shipmentPriorityLabel,
  shipmentStatusLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiGetWithMeta } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { formatApiError, formatDate } from './form-utils';

export function ShipmentsPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = canCreateShipments(user?.permissions);
  const canUpdate = canUpdateShipments(user?.permissions);
  const [shipments, setShipments] = useState<ShipmentPayload[]>([]);
  const [customers, setCustomers] = useState<CustomerPayload[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ShipmentStatus | ''>('');
  const [priority, setPriority] = useState<ShipmentPriority | ''>('');
  const [customerId, setCustomerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<ShipmentSortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 10;

  async function load(
    nextPage = page,
    overrides?: Partial<{
      query: string;
      status: ShipmentStatus | '';
      priority: ShipmentPriority | '';
      customerId: string;
      from: string;
      to: string;
    }>,
  ) {
    setLoading(true);
    setError(null);
    const nextQuery = overrides?.query ?? query;
    const nextStatus = overrides?.status ?? status;
    const nextPriority = overrides?.priority ?? priority;
    const nextCustomerId = overrides?.customerId ?? customerId;
    const nextFrom = overrides?.from ?? from;
    const nextTo = overrides?.to ?? to;
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
      sort,
      order,
    });
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    if (nextStatus) params.set('status', nextStatus);
    if (nextPriority) params.set('priority', nextPriority);
    if (nextCustomerId) params.set('customerId', nextCustomerId);
    if (nextFrom) params.set('from', new Date(nextFrom).toISOString());
    if (nextTo) params.set('to', new Date(`${nextTo}T23:59:59`).toISOString());
    try {
      const result = await apiGetWithMeta<ShipmentPayload[]>(`/shipments?${params.toString()}`);
      setShipments(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load shipments'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    if (basePath === '/admin') {
      apiGet<CustomerPayload[]>('/customers?pageSize=100')
        .then(setCustomers)
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, sort, order, status, priority, customerId]);

  function clearFilters() {
    setQuery('');
    setStatus('');
    setPriority('');
    setCustomerId('');
    setFrom('');
    setTo('');
    void load(1, {
      query: '',
      status: '',
      priority: '',
      customerId: '',
      from: '',
      to: '',
    });
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function setSortPair(field: ShipmentSortField) {
    if (sort === field) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(field);
    setOrder(field === 'reference' || field === 'customerName' ? 'asc' : 'desc');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 5</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Shipments</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Book, track, and update freight movements from pickup through delivery.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="rounded-md bg-[#12355b] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#0d2743]"
            to={`${basePath}/shipments/new`}
          >
            Create shipment
          </Link>
        ) : null}
      </div>

      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1);
        }}
      >
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
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
              {shipmentStatusLabel(item)}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={priority}
          onChange={(event) => setPriority(event.target.value as ShipmentPriority | '')}
        >
          <option value="">All priorities</option>
          {SHIPMENT_PRIORITIES.map((item) => (
            <option key={item} value={item}>
              {shipmentPriorityLabel(item)}
            </option>
          ))}
        </select>
        {basePath === '/admin' ? (
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        ) : (
          <div />
        )}
        <div className="flex gap-2 md:col-span-6">
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <button className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white" type="submit">
            Search
          </button>
          <button
            className="rounded-md border px-3 py-2 text-sm"
            type="button"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <SortHeader
                label="Reference"
                field="reference"
                current={sort}
                order={order}
                onClick={setSortPair}
              />
              <SortHeader
                label="Customer"
                field="customerName"
                current={sort}
                order={order}
                onClick={setSortPair}
              />
              <th className="px-4 py-3 font-medium">Pickup</th>
              <th className="px-4 py-3 font-medium">Delivery</th>
              <SortHeader
                label="Status"
                field="status"
                current={sort}
                order={order}
                onClick={setSortPair}
              />
              <SortHeader
                label="Priority"
                field="priority"
                current={sort}
                order={order}
                onClick={setSortPair}
              />
              <th className="px-4 py-3 font-medium">Weight / pkgs</th>
              <SortHeader
                label="Requested delivery"
                field="estimatedDeliveryAt"
                current={sort}
                order={order}
                onClick={setSortPair}
              />
              <SortHeader
                label="Created"
                field="createdAt"
                current={sort}
                order={order}
                onClick={setSortPair}
              />
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={10}>
                  Loading shipments…
                </td>
              </tr>
            ) : shipments.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={10}>
                  No shipments match these filters.
                </td>
              </tr>
            ) : (
              shipments.map((shipment) => (
                <tr
                  key={shipment.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`${basePath}/shipments/${shipment.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[#12355b]">{shipment.reference}</td>
                  <td className="px-4 py-3">{shipment.customerName}</td>
                  <td className="px-4 py-3">
                    {shipment.origin?.formattedAddress ?? shipment.originCountryCode}
                  </td>
                  <td className="px-4 py-3">
                    {shipment.destination?.formattedAddress ?? shipment.destinationCountryCode}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={shipment.status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={shipment.priority} />
                  </td>
                  <td className="px-4 py-3">
                    {shipment.weightKg != null ? `${shipment.weightKg} kg` : '—'}
                    {shipment.piecesCount != null ? ` · ${shipment.piecesCount} pkg` : ''}
                  </td>
                  <td className="px-4 py-3">{formatDate(shipment.estimatedDeliveryAt)}</td>
                  <td className="px-4 py-3">{formatDate(shipment.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                      <Link
                        className="text-[#12355b] hover:underline"
                        to={`${basePath}/shipments/${shipment.id}`}
                      >
                        View
                      </Link>
                      {canUpdate &&
                      shipment.status !== 'CANCELLED' &&
                      shipment.status !== 'DELIVERED' ? (
                        <Link
                          className="text-[#12355b] hover:underline"
                          to={`${basePath}/shipments/${shipment.id}/edit`}
                        >
                          Edit
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          {total} shipment{total === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
            disabled={page >= pageCount || loading}
            onClick={() => void load(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  field,
  current,
  order,
  onClick,
}: {
  label: string;
  field: ShipmentSortField;
  current: ShipmentSortField;
  order: 'asc' | 'desc';
  onClick: (field: ShipmentSortField) => void;
}) {
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        className="inline-flex items-center gap-1"
        onClick={() => onClick(field)}
      >
        {label}
        <span className="text-xs text-slate-400">
          {current === field ? (order === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}
