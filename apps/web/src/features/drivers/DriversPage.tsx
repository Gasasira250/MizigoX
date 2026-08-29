import type {
  DriverAvailability,
  DriverPayload,
  DriverSortField,
  DriverStatus,
} from '@mizigox/shared';
import {
  canCreateDrivers,
  canUpdateDrivers,
  canUpdateDriverStatus,
  fleetStatusLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGetWithMeta, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { DocumentAlertBadge } from '../fleet/DocumentAlertBadge';
import {
  driverAvailabilityOptions,
  driverStatusOptions,
  expiryWindowOptions,
  formatApiError,
  formatDate,
} from '../fleet/form-utils';

export function DriversPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canCreate = canCreateDrivers(user?.permissions);
  const canUpdate = canUpdateDrivers(user?.permissions);
  const canStatus = canUpdateDriverStatus(user?.permissions);
  const [drivers, setDrivers] = useState<DriverPayload[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<DriverStatus | ''>('');
  const [availability, setAvailability] = useState<DriverAvailability | ''>('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [sort, setSort] = useState<DriverSortField>('updatedAt');
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
    if (licenseExpiry) params.set('licenseExpiry', licenseExpiry);
    try {
      const result = await apiGetWithMeta<DriverPayload[]>(`/drivers?${params.toString()}`);
      setDrivers(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load drivers'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order, status, availability, licenseExpiry]);

  async function toggleActive(driver: DriverPayload) {
    const nextStatus = driver.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    try {
      await apiPost(`/drivers/${driver.id}/status`, { status: nextStatus });
      notify(
        nextStatus === 'INACTIVE'
          ? `${driver.reference} was deactivated.`
          : `${driver.reference} was activated.`,
      );
      await load(page);
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to update driver status'), 'error');
    }
  }

  function toggleSort(field: DriverSortField) {
    if (sort === field) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(field);
    setOrder(field === 'name' ? 'asc' : 'desc');
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 6</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Drivers</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Manage transporter drivers, licenses, availability, and identity documents. Drivers can
            optionally be linked to an existing MizigoX user account.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="rounded-md bg-[#12355b] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#0d2743]"
            to="/admin/drivers/new"
          >
            Add driver
          </Link>
        ) : null}
      </div>

      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1);
        }}
      >
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
          placeholder="Search name, reference, phone, email, or license"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as DriverStatus | '')}
        >
          <option value="">All statuses</option>
          {driverStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={availability}
          onChange={(event) => setAvailability(event.target.value as DriverAvailability | '')}
        >
          <option value="">All availability</option>
          {driverAvailabilityOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={licenseExpiry}
            onChange={(event) => setLicenseExpiry(event.target.value)}
          >
            <option value="">License expiry</option>
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
                label="Name"
                field="name"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">License</th>
              <SortHeader
                label="License expiry"
                field="licenseExpiresAt"
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
              <SortHeader
                label="Availability"
                field="availability"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <th className="px-4 py-3 font-medium">Documents</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={9}>
                  Loading drivers…
                </td>
              </tr>
            ) : drivers.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={9}>
                  No drivers match these filters. Add a driver to staff the transporter fleet.
                </td>
              </tr>
            ) : (
              drivers.map((driver) => (
                <tr
                  key={driver.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`/admin/drivers/${driver.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[#12355b]">{driver.reference}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {driver.firstName} {driver.lastName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {driver.email ?? driver.userEmail ?? 'No email'}
                    </div>
                  </td>
                  <td className="px-4 py-3">{driver.phoneE164}</td>
                  <td className="px-4 py-3">{driver.licenseCategory ?? '—'}</td>
                  <td className="px-4 py-3">{formatDate(driver.licenseExpiresAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={driver.status} />
                  </td>
                  <td className="px-4 py-3">{fleetStatusLabel(driver.availability)}</td>
                  <td className="px-4 py-3">
                    <DocumentAlertBadge alert={driver.documentAlert} />
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="flex flex-wrap gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link
                        className="text-[#12355b] hover:underline"
                        to={`/admin/drivers/${driver.id}`}
                      >
                        View
                      </Link>
                      {canUpdate ? (
                        <Link
                          className="text-teal-800 hover:underline"
                          to={`/admin/drivers/${driver.id}/edit`}
                        >
                          Edit
                        </Link>
                      ) : null}
                      <Link
                        className="text-slate-600 hover:underline"
                        to={`/admin/drivers/${driver.id}/documents`}
                      >
                        Documents
                      </Link>
                      {canStatus && (driver.status === 'ACTIVE' || driver.status === 'INACTIVE') ? (
                        <button
                          type="button"
                          className="text-slate-600 hover:underline"
                          onClick={() => void toggleActive(driver)}
                        >
                          {driver.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
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
          {total} driver{total === 1 ? '' : 's'}
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
  field: DriverSortField;
  current: DriverSortField;
  order: 'asc' | 'desc';
  onClick: (field: DriverSortField) => void;
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
