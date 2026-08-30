import type { CustomerLifecycleStatus, CustomerPayload, CustomerSortField } from '@mizigox/shared';
import {
  canCreateCustomers,
  canUpdateCustomers,
  COUNTRIES,
  CUSTOMER_LIFECYCLE_STATUSES,
  CUSTOMER_TYPES,
  customerStatusLabel,
  customerTypeLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGetWithMeta, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { formatApiError, formatDate, locationLabel } from './form-utils';

export function CustomersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canCreate = canCreateCustomers(user?.permissions);
  const canUpdate = canUpdateCustomers(user?.permissions);
  const [customers, setCustomers] = useState<CustomerPayload[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CustomerLifecycleStatus | ''>('');
  const [customerType, setCustomerType] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [sort, setSort] = useState<CustomerSortField>('createdAt');
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
    if (customerType) params.set('customerType', customerType);
    if (countryCode) params.set('countryCode', countryCode);
    try {
      const result = await apiGetWithMeta<CustomerPayload[]>(`/customers?${params.toString()}`);
      setCustomers(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load customers'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order, status, customerType, countryCode]);

  async function toggleStatus(customer: CustomerPayload) {
    try {
      await apiPost(
        `/customers/${customer.id}/${customer.status === 'ACTIVE' ? 'deactivate' : 'activate'}`,
      );
      notify(
        customer.status === 'ACTIVE'
          ? `${customer.name} was deactivated.`
          : `${customer.name} was activated.`,
      );
      await load(page);
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to update customer status'), 'error');
    }
  }

  function toggleSort(field: CustomerSortField) {
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 4</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Customers</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Manage shipper organizations, contacts, and service locations across Rwanda and East
            Africa.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="rounded-md bg-[#12355b] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#0d2743]"
            to="/admin/customers/new"
          >
            Add customer
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
          placeholder="Search name, reference, email, phone, or tax ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as CustomerLifecycleStatus | '')}
        >
          <option value="">All statuses</option>
          {CUSTOMER_LIFECYCLE_STATUSES.map((item) => (
            <option key={item} value={item}>
              {customerStatusLabel(item)}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={customerType}
          onChange={(event) => setCustomerType(event.target.value)}
        >
          <option value="">All types</option>
          {CUSTOMER_TYPES.map((item) => (
            <option key={item} value={item}>
              {customerTypeLabel(item)}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
          >
            <option value="">All countries</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
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
                field="customerReference"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <SortHeader
                label="Customer"
                field="name"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <th className="px-4 py-3 font-medium">Type</th>
              <SortHeader
                label="Status"
                field="status"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <th className="px-4 py-3 font-medium">Contact</th>
              <SortHeader
                label="Location"
                field="city"
                current={sort}
                order={order}
                onClick={toggleSort}
              />
              <SortHeader
                label="Created"
                field="createdAt"
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
                <td className="px-4 py-8 text-slate-500" colSpan={8}>
                  Loading customers…
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-slate-500" colSpan={8}>
                  No customers match these filters. Add a customer to start booking freight.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`/admin/customers/${customer.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[#12355b]">
                    {customer.customerReference}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{customer.name}</div>
                    <div className="text-xs text-slate-500">{customer.email ?? 'No email'}</div>
                  </td>
                  <td className="px-4 py-3">{customerTypeLabel(customer.customerType)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={customer.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div>{customer.primaryContactName ?? '—'}</div>
                    <div className="text-xs text-slate-500">{customer.phoneE164 ?? 'No phone'}</div>
                  </td>
                  <td className="px-4 py-3">{locationLabel(customer)}</td>
                  <td className="px-4 py-3">{formatDate(customer.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div
                      className="flex flex-wrap gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link
                        className="text-[#12355b] hover:underline"
                        to={`/admin/customers/${customer.id}`}
                      >
                        View
                      </Link>
                      {canUpdate ? (
                        <>
                          <Link
                            className="text-teal-800 hover:underline"
                            to={`/admin/customers/${customer.id}/edit`}
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            className="text-slate-600 hover:underline"
                            onClick={() => void toggleStatus(customer)}
                          >
                            {customer.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
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
          {total} customer{total === 1 ? '' : 's'}
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
  field: CustomerSortField;
  current: CustomerSortField;
  order: 'asc' | 'desc';
  onClick: (field: CustomerSortField) => void;
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
