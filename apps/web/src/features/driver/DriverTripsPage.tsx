import type { DriverTripsPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';

export function DriverTripsPage() {
  const [data, setData] = useState<DriverTripsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setData(await apiGet<DriverTripsPayload>('/driver/trips'));
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load trips'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading your trips…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <EmptyState title="No trips found." />;

  const groups = [
    { title: 'Current trip', items: data.current },
    { title: 'Upcoming trips', items: data.upcoming },
    { title: 'Completed trips', items: data.completed },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My trips"
        description="Assigned routes only. Status changes are controlled by the server."
      />
      {groups.map((group) => (
        <section key={group.title} className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-[#12355b]">{group.title}</h2>
          {group.items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">None.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {group.items.map((trip) => (
                <li key={trip.id}>
                  <Link
                    className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                    to={`/driver/trips/${trip.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{trip.reference}</p>
                      <StatusBadge status={trip.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {trip.origin ?? 'Origin pending'} →{' '}
                      {trip.destination ?? 'Destination pending'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {trip.shipmentCount} shipment{trip.shipmentCount === 1 ? '' : 's'} ·{' '}
                      {trip.stopCount} stops
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
