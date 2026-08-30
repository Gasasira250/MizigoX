import type { CustomerDashboardPayload } from '@mizigox/shared';
import { canCreateShipments, canReadInvoices } from '@mizigox/shared';
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
  RecentActivity,
} from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';

export function CustomerDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<CustomerDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setData(await apiGet<CustomerDashboardPayload>('/dashboards/customer'));
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load your dashboard'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <EmptyState title="No activity yet" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer dashboard"
        description={`Welcome back, ${user?.firstName}. Track shipments and invoices for ${user?.organization.name}.`}
      />
      <QuickActions
        actions={[
          {
            label: 'New shipment',
            href: '/portal/shipments/new',
            hidden: !canCreateShipments(user?.permissions),
          },
          { label: 'Shipments', href: '/portal/shipments' },
          {
            label: 'Invoices',
            href: '/portal/invoices',
            hidden: !canReadInvoices(user?.permissions),
          },
        ]}
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active shipments"
          value={data.shipments.active}
          href="/portal/shipments"
        />
        <MetricCard label="Pending shipments" value={data.shipments.pending} />
        <MetricCard label="Delivered" value={data.shipments.delivered} />
        {data.outstandingInvoices ? (
          <MetricCard
            label="Outstanding invoices"
            value={formatMoney(
              data.outstandingInvoices.amountDue,
              data.outstandingInvoices.currencyCode,
            )}
            detail={`${data.outstandingInvoices.count} open`}
            href="/portal/invoices"
          />
        ) : null}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Recent shipments</h2>
        {data.recentShipments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No shipments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {data.recentShipments.map((shipment) => (
              <li
                key={shipment.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <Link
                  className="font-medium text-[#12355b] hover:underline"
                  to={`/portal/shipments/${shipment.id}`}
                >
                  {shipment.reference}
                </Link>
                <StatusBadge status={shipment.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <RecentActivity
        title="Recent activity"
        empty="No recent activity."
        items={data.recentActivity}
      />
    </div>
  );
}
