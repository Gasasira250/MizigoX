import type { DriverTripDetailPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function DriverRoutePage() {
  const { routeId } = useParams();
  const { notify } = useToast();
  const [trip, setTrip] = useState<DriverTripDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!routeId || !UUID_PATTERN.test(routeId)) {
      setError('Trip not found');
      return;
    }
    try {
      setTrip(await apiGet<DriverTripDetailPayload>(`/driver/trips/${routeId}`));
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load this trip'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  async function run(path: string, success: string) {
    setBusy(true);
    try {
      setTrip(await apiPost<DriverTripDetailPayload>(path));
      notify(success);
    } catch (cause) {
      notify(formatAppError(cause, 'Unable to update trip'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (error && !trip) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }
  if (!trip) {
    return <LoadingState label="Loading route…" />;
  }

  const canAccept = (trip.status === 'DISPATCHED' || trip.status === 'READY') && !trip.acceptedAt;
  const canStart = trip.status === 'DISPATCHED' && Boolean(trip.acceptedAt);
  const canCompleteTrip =
    (trip.status === 'IN_TRANSIT' || trip.status === 'ARRIVED') &&
    trip.stops.every((stop) => stop.status === 'SERVICED' || stop.status === 'SKIPPED');

  return (
    <div className="space-y-6">
      <PageHeader
        title={trip.reference}
        description={`${trip.origin ?? 'Origin pending'} → ${trip.destination ?? 'Destination pending'}`}
        actions={<StatusBadge status={trip.status} />}
      />
      {trip.instructions ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {trip.instructions}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {canAccept ? (
          <button
            type="button"
            className="min-h-11 rounded-md bg-[#12355b] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void run(`/driver/trips/${trip.id}/accept`, 'Trip accepted')}
          >
            Accept trip
          </button>
        ) : null}
        {canStart ? (
          <button
            type="button"
            className="min-h-11 rounded-md bg-teal-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void run(`/driver/trips/${trip.id}/start`, 'Trip started')}
          >
            Start trip
          </button>
        ) : null}
        {canCompleteTrip ? (
          <button
            type="button"
            className="min-h-11 rounded-md border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => void run(`/driver/trips/${trip.id}/complete`, 'Trip completed')}
          >
            Complete trip
          </button>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#12355b]">Ordered stops</h2>
        {trip.stops.map((stop) => (
          <article key={stop.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                {stop.sequence}. {stop.stopType}
              </p>
              <StatusBadge status={stop.status} />
            </div>
            <p className="mt-1 text-sm text-slate-600">{stop.formattedAddress}</p>
            {stop.contactName ? <p className="text-sm text-slate-600">{stop.contactName}</p> : null}
            {stop.instructions ? <p className="mt-2 text-sm">{stop.instructions}</p> : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {stop.status === 'PENDING' ? (
                <button
                  type="button"
                  className="min-h-11 rounded-md bg-[#12355b] px-4 py-2 text-sm text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void run(`/driver/stops/${stop.id}/arrive`, 'Arrived at stop')}
                >
                  Arrive at stop
                </button>
              ) : null}
              {stop.status === 'ARRIVED' ? (
                <button
                  type="button"
                  className="min-h-11 rounded-md bg-teal-800 px-4 py-2 text-sm text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void run(`/driver/stops/${stop.id}/complete`, 'Stop completed')}
                >
                  Complete stop
                </button>
              ) : null}
              {stop.shipmentId ? (
                <Link
                  className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-center text-sm"
                  to={`/driver/shipments/${stop.shipmentId}`}
                >
                  Shipment {stop.shipmentReference ?? ''}
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
