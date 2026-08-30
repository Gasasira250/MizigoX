import type { DriverDashboardPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
} from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';

export function DriverDashboardPage() {
  const [data, setData] = useState<DriverDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setData(await apiGet<DriverDashboardPayload>('/dashboards/driver'));
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load your assignment'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading your assignment…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <EmptyState title="No driver profile is linked to this account." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Driver dashboard"
        description="Your current assignment, next stop, and trip instructions."
      />
      <section className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Shipments on trip" value={data.shipmentCount} />
        <MetricCard
          label="Last location"
          value={data.tracking.lastLocation ? 'Reported' : 'None'}
          detail={
            data.tracking.lastLocation
              ? new Date(data.tracking.lastLocation.lastUpdatedAt).toLocaleString()
              : 'Submit a live update from Tracking. Background GPS is not available in the browser.'
          }
        />
      </section>
      {data.currentAssignment ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#12355b]">Current assignment</h2>
            <StatusBadge status={data.currentAssignment.status} />
          </div>
          <p className="mt-2 text-lg font-semibold">{data.currentAssignment.reference}</p>
          <p className="text-sm text-slate-600">
            {data.currentAssignment.origin ?? 'Origin pending'} →{' '}
            {data.currentAssignment.destination ?? 'Destination pending'}
          </p>
          {data.instructions ? (
            <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {data.instructions}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="rounded-md bg-[#12355b] px-4 py-2.5 text-sm font-medium text-white"
              to={`/driver/trips/${data.currentAssignment.id}`}
            >
              Open route
            </Link>
            <Link
              className="rounded-md border border-slate-300 px-4 py-2.5 text-sm"
              to="/driver/tracking"
            >
              Location tracking
            </Link>
          </div>
        </section>
      ) : (
        <EmptyState
          title="No current assignment"
          detail="You do not have a dispatched trip right now."
        />
      )}
      {data.nextStop ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Next stop</h2>
          <p className="mt-2 font-medium">
            Stop {data.nextStop.sequence} · {data.nextStop.stopType}
          </p>
          <p className="text-sm text-slate-600">{data.nextStop.formattedAddress}</p>
          {data.nextStop.instructions ? (
            <p className="mt-2 text-sm text-slate-700">{data.nextStop.instructions}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
