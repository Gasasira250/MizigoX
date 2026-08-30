import type { FinanceDashboardPayload } from '@mizigox/shared';
import { canCreateInvoices, canCreatePayments } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../billing/format';
import { apiGet } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthProvider';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  QuickActions,
  StatusChart,
} from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';

export function FinanceDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<FinanceDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setData(await apiGet<FinanceDashboardPayload>('/dashboards/finance'));
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load finance dashboard'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <LoadingState label="Loading finance dashboard…" />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!data) {
    return <EmptyState title="No financial data" />;
  }

  const summary = data.summary;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance dashboard"
        description="Invoice, payment, and outstanding balance totals calculated from live records."
      />
      <QuickActions
        actions={[
          {
            label: 'New invoice',
            href: '/admin/invoices/new',
            hidden: !canCreateInvoices(user?.permissions),
          },
          {
            label: 'Record payment',
            href: '/admin/payments/new',
            hidden: !canCreatePayments(user?.permissions),
          },
          { label: 'Customers', href: '/admin/customers' },
        ]}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total invoiced"
          value={formatMoney(summary.totalRevenue, summary.currencyCode)}
          href="/admin/invoices"
        />
        <MetricCard
          label="Total paid"
          value={formatMoney(summary.amountPaid, summary.currencyCode)}
          href="/admin/payments"
        />
        <MetricCard
          label="Outstanding"
          value={formatMoney(summary.amountDue, summary.currencyCode)}
          detail={`${summary.outstandingInvoiceCount} open invoices`}
        />
        <MetricCard
          label="Overdue"
          value={formatMoney(summary.overdueAmount, summary.currencyCode)}
          detail={`${summary.overdueInvoiceCount} overdue invoices`}
        />
      </section>
      <StatusChart title="Payment status summary" items={data.paymentStatus} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-[#12355b]">Recent invoices</h2>
          {data.recentInvoices.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No invoices found.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.recentInvoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <Link
                    className="font-medium text-[#12355b] hover:underline"
                    to={`/admin/invoices/${invoice.id}`}
                  >
                    {invoice.number}
                  </Link>
                  <StatusBadge status={invoice.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-[#12355b]">Recent payments</h2>
          {data.recentPayments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No payments recorded.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.recentPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <Link
                    className="font-medium text-[#12355b] hover:underline"
                    to={`/admin/payments/${payment.id}`}
                  >
                    {payment.reference}
                  </Link>
                  <StatusBadge status={payment.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
