import type {
  DriverPayload,
  RoutePayload,
  RouteSortField,
  RouteStatus,
  VehiclePayload,
} from '@mizigox/shared';
import { canCreateRoutes, canUpdateRoutes, routeStatusLabel } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGetWithMeta } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { formatApiError, formatDate, routeStatusOptions } from './form-utils';

export function RoutesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = canCreateRoutes(user?.permissions);
  const canUpdate = canUpdateRoutes(user?.permissions);
  const [routes, setRoutes] = useState<RoutePayload[]>([]);
  const [vehicles, setVehicles] = useState<VehiclePayload[]>([]);
  const [drivers, setDrivers] = useState<DriverPayload[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RouteStatus | ''>('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<RouteSortField>('updatedAt');
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
      status: RouteStatus | '';
      driverId: string;
      vehicleId: string;
      from: string;
      to: string;
    }>,
  ) {
    setLoading(true);
    setError(null);
    const nextQuery = overrides?.query ?? query;
    const nextStatus = overrides?.status ?? status;
    const nextDriverId = overrides?.driverId ?? driverId;
    const nextVehicleId = overrides?.vehicleId ?? vehicleId;
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
    if (nextDriverId) params.set('driverId', nextDriverId);
    if (nextVehicleId) params.set('vehicleId', nextVehicleId);
    if (nextFrom) params.set('from', new Date(nextFrom).toISOString());
    if (nextTo) params.set('to', new Date(`${nextTo}T23:59:59`).toISOString());
    try {
      const result = await apiGetWithMeta<RoutePayload[]>(`/routes?${params.toString()}`);
      setRoutes(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load routes'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    apiGetWithMeta<VehiclePayload[]>('/vehicles?pageSize=100')
      .then((result) => setVehicles(result.data))
      .catch(() => undefined);
    apiGetWithMeta<DriverPayload[]>('/drivers?pageSize=100')
      .then((result) => setDrivers(result.data))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order, status, driverId, vehicleId]);

  function clearFilters() {
    setQuery('');
    setStatus('');
    setDriverId('');
    setVehicleId('');
    setFrom('');
    setTo('');
    void load(1, { query: '', status: '', driverId: '', vehicleId: '', from: '', to: '' });
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function setSortPair(field: RouteSortField) {
    if (sort === field) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(field);
    setOrder(field === 'reference' ? 'asc' : 'desc');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 7</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Routes</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Plan, assign, and dispatch freight routes across Rwanda and East Africa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm hover:bg-slate-50"
            to="/admin/dispatch"
          >
            Dispatch board
          </Link>
          {canCreate ? (
            <Link
              className="rounded-md bg-[#12355b] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#0d2743]"
              to="/admin/routes/new"
            >
              Create route
            </Link>
          ) : null}
        </div>
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
          placeholder="Search reference, origin, destination"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as RouteStatus | '')}
        >
          <option value="">All statuses</option>
          {routeStatusOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
        >
          <option value="">All vehicles</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.registrationNumber}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={driverId}
          onChange={(event) => setDriverId(event.target.value)}
        >
          <option value="">All drivers</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.firstName} {driver.lastName}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <input
          type="date"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <div className="flex gap-2 md:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white hover:bg-[#0d2743]"
          >
            Search
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {(
                [
                  ['reference', 'Reference'],
                  ['status', 'Status'],
                  ['plannedDepartureAt', 'Departure'],
                  ['plannedArrivalAt', 'Arrival'],
                  ['updatedAt', 'Updated'],
                ] as Array<[RouteSortField, string]>
              ).map(([field, label]) => (
                <th key={field} className="px-4 py-3">
                  <button
                    type="button"
                    className="hover:text-[#12355b]"
                    onClick={() => setSortPair(field)}
                  >
                    {label}
                    {sort === field ? (order === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3">Origin</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Shipments</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={11}>
                  Loading routes…
                </td>
              </tr>
            ) : routes.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={11}>
                  No routes match the current filters.
                </td>
              </tr>
            ) : (
              routes.map((route) => (
                <tr
                  key={route.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`/admin/routes/${route.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[#12355b]">{route.reference}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={route.status} />
                    <span className="sr-only">{routeStatusLabel(route.status)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(route.plannedDepartureAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(route.plannedArrivalAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(route.updatedAt)}</td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-slate-600">
                    {route.origin ?? '—'}
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-slate-600">
                    {route.destination ?? '—'}
                  </td>
                  <td className="px-4 py-3">{route.shipmentCount}</td>
                  <td className="px-4 py-3 text-slate-600">{route.vehicleRegistration ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{route.driverName ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {canUpdate ? (
                      <Link
                        className="text-teal-800 hover:underline"
                        to={`/admin/routes/${route.id}/edit`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Edit
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Page {page} of {pageCount} · {total} routes
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => void load(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
            disabled={page >= pageCount}
            onClick={() => void load(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
