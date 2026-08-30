import type { OperationsDashboardPayload } from '@mizigox/shared';
import { can, canCreateShipments, canDispatchRoutes, canReadFinanceDashboard } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthProvider';
import {
  AlertList,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  QuickActions,
  RecentActivity,
  StatusChart,
} from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { FinanceDashboardPage } from './FinanceDashboardPage';

export function OperationsDashboardPage() {
  const { user } = useAuth();
  const canOps = can(user?.permissions, 'dashboard.operations');
  const [data, setData] = useState<OperationsDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setData(await apiGet<OperationsDashboardPayload>('/dashboards/operations'));
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load operations dashboard'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canOps) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canOps]);

  if (!canOps && canReadFinanceDashboard(user?.permissions)) {
    return <FinanceDashboardPage />;
  }

  if (loading) {
    return <LoadingState label="Loading operations dashboard…" />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!data) {
    return <EmptyState title="Dashboard unavailable" detail="No operations metrics are available for this role." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations dashboard"
        description="Live shipment, route, fleet, and tracking metrics for your organization."
      />
      <QuickActions
        actions={[
          { label: 'New shipment', href: '/admin/shipments/new', hidden: !canCreateShipments(user?.permissions) },
          { label: 'Dispatch board', href: '/admin/dispatch', hidden: !canDispatchRoutes(user?.permissions) },
          { label: 'Live tracking', href: '/admin/tracking' },
        ]}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active shipments" value={data.shipments.active} href="/admin/shipments" />
        <MetricCard label="Awaiting pickup" value={data.shipments.awaitingPickup} />
        <MetricCard label="In transit" value={data.shipments.inTransit} />
        <MetricCard label="Out for delivery" value={data.shipments.outForDelivery} />
        <MetricCard label="Delivered" value={data.shipments.delivered} />
        <MetricCard label="Delivery failures" value={data.shipments.deliveryFailed} />
        <MetricCard label="Active routes" value={data.routes.active} href="/admin/routes" />
        <MetricCard label="Awaiting dispatch" value={data.routes.awaitingDispatch} href="/admin/dispatch" />
        <MetricCard label="Available vehicles" value={data.fleet.availableVehicles} href="/admin/vehicles" />
        <MetricCard label="Available drivers" value={data.fleet.availableDrivers} href="/admin/drivers" />
        <MetricCard label="Overdue shipments" value={data.shipments.overdue} />
        <MetricCard
          label="Live vehicles"
          value={data.tracking.liveVehicles}
          detail={data.tracking.lastUpdateAt ? `Last update ${new Date(data.tracking.lastUpdateAt).toLocaleString()}` : 'No location updates'}
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <StatusChart title="Shipment status summary" items={data.shipments.byStatus} />
        <AlertList alerts={data.alerts} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-[#12355b]">Recent shipments</h2>
          {data.recentShipments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No shipments yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.recentShipments.map((shipment) => (
                <li key={shipment.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link className="font-medium text-[#12355b] hover:underline" to={`/admin/shipments/${shipment.id}`}>
                    {shipment.reference}
                  </Link>
                  <StatusBadge status={shipment.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-[#12355b]">Recent routes</h2>
          {data.recentRoutes.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No routes yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.recentRoutes.map((route) => (
                <li key={route.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link className="font-medium text-[#12355b] hover:underline" to={`/admin/routes/${route.id}`}>
                    {route.reference}
                  </Link>
                  <StatusBadge status={route.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <RecentActivity
        title="Dispatch activity"
        empty="No recent dispatch activity."
        items={data.dispatchActivity}
      />
    </div>
  );
}
