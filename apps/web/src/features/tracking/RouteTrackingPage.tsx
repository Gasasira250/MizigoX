import type { RouteTrackingPayload, TrackingConfigPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { FreshnessBadge } from './FreshnessBadge';
import { formatApiError, formatDateTime } from './format';
import { LocationDetails } from './map/LocationDetails';
import { MapView } from './map/MapView';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function RouteTrackingPage() {
  const { routeId } = useParams();
  const [tracking, setTracking] = useState<RouteTrackingPayload | null>(null);
  const [config, setConfig] = useState<TrackingConfigPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!routeId || !UUID_PATTERN.test(routeId)) {
      setError('Route not found');
      return;
    }
    void Promise.all([
      apiGet<RouteTrackingPayload>(`/tracking/routes/${routeId}`),
      apiGet<TrackingConfigPayload>('/tracking/config'),
    ])
      .then(([record, trackingConfig]) => {
        setTracking(record);
        setConfig(trackingConfig);
        setError(null);
      })
      .catch((cause) => setError(formatApiError(cause, 'Unable to load route tracking')));
  }, [routeId]);

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!tracking) {
    return <p className="text-sm text-slate-500">Loading route tracking…</p>;
  }

  const currentStop = tracking.stops.find((stop) => stop.id === tracking.currentStopId);
  const nextStop = tracking.stops.find((stop) => stop.id === tracking.nextStopId);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Route tracking</p>
        <h1 className="text-2xl font-semibold text-[#12355b]">{tracking.reference}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <StatusBadge status={tracking.status} />
          <FreshnessBadge freshness={tracking.freshness} />
          <Link className="text-sm text-teal-800 hover:underline" to={`/admin/routes/${tracking.routeId}`}>
            Route details
          </Link>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card label="Driver" value={tracking.driverName ?? 'Unassigned'} />
        <Card label="Vehicle" value={tracking.vehicleRegistration ?? 'Unassigned'} />
        <Card label="Current stop" value={currentStop?.formattedAddress ?? '—'} />
        <Card label="Next stop" value={nextStop?.formattedAddress ?? '—'} />
      </div>
      <MapView
        provider={config?.map.provider ?? 'osm'}
        publicKey={config?.map.publicKey ?? null}
        vehicles={
          tracking.currentLocation
            ? [
                {
                  id: tracking.currentLocation.vehicleId,
                  latitude: tracking.currentLocation.latitude,
                  longitude: tracking.currentLocation.longitude,
                  label: tracking.vehicleRegistration ?? 'Vehicle',
                  kind: 'vehicle',
                  freshness: tracking.currentLocation.freshness,
                  subtitle: tracking.driverName ?? undefined,
                },
              ]
            : []
        }
        stops={tracking.stops
          .filter((stop) => stop.latitude != null && stop.longitude != null)
          .map((stop) => ({
            id: stop.id,
            latitude: stop.latitude as number,
            longitude: stop.longitude as number,
            label: `Stop ${stop.sequence}`,
            kind: 'stop' as const,
            subtitle: stop.formattedAddress,
          }))}
        shipments={[]}
        path={tracking.stops
          .filter((stop) => stop.latitude != null && stop.longitude != null)
          .map((stop) => ({ latitude: stop.latitude as number, longitude: stop.longitude as number }))}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <LocationDetails location={tracking.currentLocation} title="Current vehicle location" />
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Stops</h2>
        <ol className="mt-4 space-y-3">
          {tracking.stops.map((stop) => (
            <li key={stop.id} className="border-l-2 border-teal-200 pl-3">
              <p className="text-sm font-medium text-slate-900">
                {stop.sequence}. {stop.formattedAddress}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <StatusBadge status={stop.stopType} />
                <StatusBadge status={stop.status} />
                {stop.id === tracking.currentStopId ? <StatusBadge status="CURRENT" /> : null}
                {stop.id === tracking.nextStopId ? <StatusBadge status="NEXT" /> : null}
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-500">Last known update {formatDateTime(tracking.lastUpdatedAt)}.</p>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </article>
  );
}
