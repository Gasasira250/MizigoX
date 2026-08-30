import type { PaymentPayload, PaymentSortField, PaymentStatus } from '@mizigox/shared';
import {
  PAYMENT_METHODS,
  PAYMENT_SORT_FIELDS,
  PAYMENT_STATUSES,
  canCreatePayments,
  paymentMethodLabel,
  paymentStatusLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGetWithMeta } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { formatApiError, formatDateTime, formatMoney } from './format';

export function PaymentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = canCreatePayments(user?.permissions);
  const [payments, setPayments] = useState<PaymentPayload[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [method, setMethod] = useState('');
  const [sort, setSort] = useState<PaymentSortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 10;

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
    if (method) params.set('method', method);
    try {
      const result = await apiGetWithMeta<PaymentPayload[]>(`/payments?${params.toString()}`);
      setPayments(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load payments'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order, status, method]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 9</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Payments</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Record offline cash, bank, and mobile-money payments. A payment is only successful after
            confirmation.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="rounded-md bg-[#12355b] px-4 py-2 text-center text-sm font-medium text-white hover:bg-[#0d2743]"
            to="/admin/payments/new"
          >
            Record payment
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
          placeholder="Search payment or invoice"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as PaymentStatus | '')}
        >
          <option value="">All statuses</option>
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {paymentStatusLabel(value)}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((value) => (
            <option key={value} value={value}>
              {paymentMethodLabel(value)}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white" type="submit">
          Search
        </button>
      </form>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {PAYMENT_SORT_FIELDS.map((field) => (
                <th key={field} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (sort === field) {
                        setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setSort(field);
                      }
                    }}
                  >
                    {field === 'createdAt'
                      ? 'Created'
                      : field === 'paidAt'
                        ? 'Paid'
                        : field === 'amount'
                          ? 'Amount'
                          : field === 'status'
                            ? 'Status'
                            : 'Reference'}
                    {sort === field ? (order === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Method</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  Loading payments…
                </td>
              </tr>
            ) : payments.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  No payments found.
                </td>
              </tr>
            ) : (
              payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => navigate(`/admin/payments/${payment.id}`)}
                >
                  <td className="px-4 py-3">{formatDateTime(payment.createdAt)}</td>
                  <td className="px-4 py-3">{formatDateTime(payment.paidAt)}</td>
                  <td className="px-4 py-3">{formatMoney(payment.amount, payment.currencyCode)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={payment.status} />
                  </td>
                  <td className="px-4 py-3 font-medium text-[#12355b]">{payment.reference}</td>
                  <td className="px-4 py-3">{payment.invoiceNumber}</td>
                  <td className="px-4 py-3">{payment.customerName}</td>
                  <td className="px-4 py-3">{paymentMethodLabel(payment.method)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Page {page} of {pageCount} · {total} payments
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
