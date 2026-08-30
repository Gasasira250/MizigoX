import type {
  VehicleAvailability,
  VehiclePayload,
  VehicleSortField,
  VehicleStatus,
  VehicleTypePayload,
} from '@mizigox/shared';
import {
  canCreateVehicles,
  canUpdateVehicles,
  canUpdateVehicleStatus,
  capacityLabel,
  fleetStatusLabel,
  vehicleTypeLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiGetWithMeta, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { DocumentAlertBadge } from '../fleet/DocumentAlertBadge';
import {
  expiryWindowOptions,
  formatApiError,
  formatDate,
  vehicleAvailabilityOptions,
  vehicleStatusOptions,
} from '../fleet/form-utils';

export function VehiclesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canCreate = canCreateVehicles(user?.permissions);
  const canUpdate = canUpdateVehicles(user?.permissions);
  const canStatus = canUpdateVehicleStatus(user?.permissions);
  const [vehicles, setVehicles] = useState<VehiclePayload[]>([]);
  const [types, setTypes] = useState<VehicleTypePayload[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<VehicleStatus | ''>('');
  const [availability, setAvailability] = useState<VehicleAvailability | ''>('');
  const [vehicleType, setVehicleType] = useState('');
  const [documentAlert, setDocumentAlert] = useState('');
  const [sort, setSort] = useState<VehicleSortField>('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
      sort,
      order,
    });
    if (query.trim()) params.set('q', query.trim());
    if (status) params.set('status', status);
    if (availability) params.set('availability', availability);
    if (vehicleType) params.set('vehicleType', vehicleType);
    if (documentAlert) params.set('documentAlert', documentAlert);
    try {
      const result = await apiGetWithMeta<VehiclePayload[]>(`/vehicles?${params.toString()}`);
      setVehicles(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load vehicles'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    apiGet<VehicleTypePayload[]>('/vehicles/types')
      .then(setTypes)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order, status, availability, vehicleType, documentAlert]);

  async function toggleActive(vehicle: VehiclePayload) {
    const nextStatus = vehicle.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    try {
      await apiPost(`/vehicles/${vehicle.id}/status`, { status: nextStatus });
      notify(
        nextStatus === 'INACTIVE'
          ? `${vehicle.reference} was deactivated.`
          : `${vehicle.reference} was activated.`,
      );
      await load(page);
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to update vehicle status'), 'error');
    }
  }

  function toggleSort(field: VehicleSortField) {
    if (sort === field) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(field);
    setOrder(field === 'registrationNumber' ? 'asc' : 'desc');
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 6</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Vehicles</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Manage transporter vehicles, capacity, availability, and compliance documents for Rwanda
            operations.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="rounded-md bg-[#12355b] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#0d2743]"
            to="/admin/vehicles/new"
          >
            Add vehicle
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
          placeholder="Search reference, plate, make, or model"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as VehicleStatus | '')}
        >
          <option value="">All statuses</option>
          {vehicleStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={availability}
          onChange={(event) => setAvailability(event.target.value as VehicleAvailability | '')}
        >
          <option value="">All availability</option>
          {vehicleAvailabilityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={vehicleType}
          onChange={(event) => setVehicleType(event.target.value)}
        >
          <option value="">All types</option>
          {types.map((type) => (
            <option key={type.code} value={type.code}>
              {type.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={documentAlert}
            onChange={(event) => setDocumentAlert(event.target.value)}
          >
            <option value="">Document expiry</option>
            {expiryWindowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="rounded-md border px-3 py-2 text-sm" type="submit">
            Search
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
                onClick={toggleSort}
              />
              <SortHeader
                label="Registration"
                field="registrationNumber"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <SortHeader
                label="Type"
                field="vehicleType"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <th className="px-4 py-3 font-medium">Make / model</th>
              <SortHeader
                label="Capacity"
                field="payloadCapacity"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <SortHeader
                label="Status"
                field="status"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <th className="px-4 py-3 font-medium">Assigned driver</th>
              <th className="px-4 py-3 font-medium">Documents</th>
              <SortHeader
                label="Updated"
                field="updatedAt"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={10}>
                  Loading vehicles…
                </td>
              </tr>
            ) : vehicles.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={10}>
                  No vehicles match these filters. Add a vehicle to start building the fleet.
                </td>
              </tr>
            ) : (
              vehicles.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`/admin/vehicles/${vehicle.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[#12355b]">{vehicle.reference}</td>
                  <td className="px-4 py-3">{vehicle.registrationNumber}</td>
                  <td className="px-4 py-3">
                    {vehicle.vehicleTypeName || vehicleTypeLabel(vehicle.vehicleType)}
                  </td>
                  <td className="px-4 py-3">
                    {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'}
                    {vehicle.year ? (
                      <div className="text-xs text-slate-500">{vehicle.year}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {capacityLabel(vehicle.payloadCapacity, vehicle.payloadUnit)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={vehicle.status} />
                    <div className="mt-1 text-xs text-slate-500">
                      {fleetStatusLabel(vehicle.availability)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">Not assigned</td>
                  <td className="px-4 py-3">
                    <DocumentAlertBadge alert={vehicle.documentAlert} />
                  </td>
                  <td className="px-4 py-3">{formatDate(vehicle.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div
                      className="flex flex-wrap gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link
                        className="text-[#12355b] hover:underline"
                        to={`/admin/vehicles/${vehicle.id}`}
                      >
                        View
                      </Link>
                      {canUpdate && vehicle.status !== 'RETIRED' ? (
                        <Link
                          className="text-teal-800 hover:underline"
                          to={`/admin/vehicles/${vehicle.id}/edit`}
                        >
                          Edit
                        </Link>
                      ) : null}
                      <Link
                        className="text-slate-600 hover:underline"
                        to={`/admin/vehicles/${vehicle.id}/documents`}
                      >
                        Documents
                      </Link>
                      {canStatus &&
                      (vehicle.status === 'ACTIVE' || vehicle.status === 'INACTIVE') ? (
                        <button
                          type="button"
                          className="text-slate-600 hover:underline"
                          onClick={() => void toggleActive(vehicle)}
                        >
                          {vehicle.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
                        </button>
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
          {total} vehicle{total === 1 ? '' : 's'}
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
  field: VehicleSortField;
  current: VehicleSortField;
  order: 'asc' | 'desc';
  onClick: (field: VehicleSortField) => void;
}) {
  const active = current === field;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        className="inline-flex items-center gap-1"
        onClick={() => onClick(field)}
      >
        {label}
        <span className="text-xs text-slate-400">
          {active ? (order === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}
