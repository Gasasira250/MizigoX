import type {
  CustomerPayload,
  FinanceSummaryPayload,
  InvoicePayload,
  InvoiceSortField,
  InvoiceStatus,
} from '@mizigox/shared';
import {
  INVOICE_SORT_FIELDS,
  INVOICE_STATUSES,
  canCreateInvoices,
  canReadFinance,
  invoiceStatusLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiGetWithMeta } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { FinanceSummaryCards } from './FinanceSummaryCards';
import { formatApiError, formatDateOnly, formatMoney } from './format';

export function InvoicesPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = basePath === '/admin' && canCreateInvoices(user?.permissions);
  const showFinance = basePath === '/admin' && canReadFinance(user?.permissions);
  const [invoices, setInvoices] = useState<InvoicePayload[]>([]);
  const [customers, setCustomers] = useState<CustomerPayload[]>([]);
  const [summary, setSummary] = useState<FinanceSummaryPayload | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [customerId, setCustomerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [sort, setSort] = useState<InvoiceSortField>('createdAt');
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
      status: InvoiceStatus | '';
      customerId: string;
      from: string;
      to: string;
      overdue: boolean;
    }>,
  ) {
    setLoading(true);
    setError(null);
    const nextQuery = overrides?.query ?? query;
    const nextStatus = overrides?.status ?? status;
    const nextCustomerId = overrides?.customerId ?? customerId;
    const nextFrom = overrides?.from ?? from;
    const nextTo = overrides?.to ?? to;
    const nextOverdue = overrides?.overdue ?? overdue;
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
      sort,
      order,
    });
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    if (nextStatus) params.set('status', nextStatus);
    if (nextCustomerId) params.set('customerId', nextCustomerId);
    if (nextOverdue) params.set('overdue', 'true');
    if (nextFrom) params.set('from', new Date(`${nextFrom}T00:00:00.000Z`).toISOString());
    if (nextTo) params.set('to', new Date(`${nextTo}T23:59:59.000Z`).toISOString());
    try {
      const result = await apiGetWithMeta<InvoicePayload[]>(`/invoices?${params.toString()}`);
      setInvoices(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load invoices'));
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
    if (showFinance) {
      apiGet<FinanceSummaryPayload>('/billing/finance/summary')
        .then(setSummary)
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, sort, order, status, customerId, overdue, showFinance]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function setSortPair(field: InvoiceSortField) {
    if (sort === field) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSort(field);
    setOrder(field === 'number' || field === 'customerName' ? 'asc' : 'desc');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 9</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Invoices</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Issue customer invoices, track balances, and record confirmed payments in RWF.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="rounded-md bg-[#12355b] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#0d2743]"
            to={`${basePath}/invoices/new`}
          >
            Create invoice
          </Link>
        ) : null}
      </div>

      {summary ? <FinanceSummaryCards summary={summary} /> : null}

      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1);
        }}
      >
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
          placeholder="Search number or customer"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as InvoiceStatus | '')}
        >
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {invoiceStatusLabel(value)}
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(event) => setOverdue(event.target.checked)}
          />
          Overdue only
        </label>
        <div className="flex gap-2 md:col-span-2">
          <button className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white" type="submit">
            Search
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="button"
            onClick={() => {
              setQuery('');
              setStatus('');
              setCustomerId('');
              setFrom('');
              setTo('');
              setOverdue(false);
              void load(1, {
                query: '',
                status: '',
                customerId: '',
                from: '',
                to: '',
                overdue: false,
              });
            }}
          >
            Clear
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {INVOICE_SORT_FIELDS.filter((field) =>
                ['number', 'customerName', 'issueDate', 'dueDate', 'total', 'status'].includes(
                  field,
                ),
              ).map((field) => (
                <th key={field} className="px-4 py-3">
                  <button type="button" onClick={() => setSortPair(field)}>
                    {field === 'number'
                      ? 'Invoice'
                      : field === 'customerName'
                        ? 'Customer'
                        : field === 'issueDate'
                          ? 'Issued'
                          : field === 'dueDate'
                            ? 'Due'
                            : field === 'total'
                              ? 'Total'
                              : 'Status'}
                    {sort === field ? (order === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Currency</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={9}>
                  Loading invoices…
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={9}>
                  No invoices match these filters.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`${basePath}/invoices/${invoice.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-[#12355b]">{invoice.number}</td>
                  <td className="px-4 py-3">{invoice.customerName}</td>
                  <td className="px-4 py-3">{formatDateOnly(invoice.issueDate)}</td>
                  <td className="px-4 py-3">{formatDateOnly(invoice.dueDate)}</td>
                  <td className="px-4 py-3">
                    {formatMoney(invoice.totalAmount, invoice.currencyCode)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={invoice.status} />
                    <span className="sr-only">{invoiceStatusLabel(invoice.status)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {formatMoney(invoice.amountPaid, invoice.currencyCode)}
                  </td>
                  <td className="px-4 py-3">
                    {formatMoney(invoice.amountDue, invoice.currencyCode)}
                  </td>
                  <td className="px-4 py-3">{invoice.currencyCode}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Page {page} of {pageCount} · {total} invoices
        </p>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
            disabled={page <= 1}
            type="button"
            onClick={() => void load(page - 1)}
          >
            Previous
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
            disabled={page >= pageCount}
            type="button"
            onClick={() => void load(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
