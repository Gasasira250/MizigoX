import type { PublicShipmentTrackingPayload, TrackingConfigPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGetPublic } from '../../shared/api/client';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { FreshnessBadge } from './FreshnessBadge';
import { formatApiError, formatDateTime } from './format';
import { MapView } from './map/MapView';

export function PublicTrackPage() {
  const { token } = useParams();
  const [tracking, setTracking] = useState<PublicShipmentTrackingPayload | null>(null);
  const [config, setConfig] = useState<TrackingConfigPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Tracking link is invalid or has been revoked');
      return;
    }
    void Promise.all([
      apiGetPublic<PublicShipmentTrackingPayload>(`/public/track/${token}`),
      apiGetPublic<TrackingConfigPayload>('/public/track/config'),
    ])
      .then(([record, trackingConfig]) => {
        setTracking(record);
        setConfig(trackingConfig);
        setError(null);
      })
      .catch((cause) =>
        setError(formatApiError(cause, 'Tracking link is invalid or has been revoked')),
      );
  }, [token]);

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <p className="text-lg font-semibold text-[#12355b]">MizigoX</p>
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Shipment tracking</p>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        {error ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            {error}
          </p>
        ) : !tracking ? (
          <p className="text-sm text-slate-500">Loading shipment tracking…</p>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-[#12355b]">{tracking.reference}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <StatusBadge status={tracking.status} />
                {tracking.currentLocation ? (
                  <FreshnessBadge freshness={tracking.currentLocation.freshness} />
                ) : null}
              </div>
            </div>
            <MapView
              provider={config?.map.provider ?? 'osm'}
              publicKey={config?.map.publicKey ?? null}
              vehicles={[]}
              stops={[]}
              shipments={
                tracking.currentLocation
                  ? [
                      {
                        id: tracking.reference,
                        latitude: tracking.currentLocation.latitude,
                        longitude: tracking.currentLocation.longitude,
                        label: tracking.reference,
                        kind: 'shipment',
                        freshness: tracking.currentLocation.freshness,
                      },
                    ]
                  : []
              }
              path={[]}
              selectedId={null}
              onSelect={() => undefined}
            />
            <section className="grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-[#12355b]">Pickup</h2>
                <p className="mt-2 text-sm text-slate-800">
                  {tracking.pickup.formattedAddress ?? '—'}
                </p>
                <p className="text-sm text-slate-500">{tracking.pickup.contactName ?? ''}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-[#12355b]">Destination</h2>
                <p className="mt-2 text-sm text-slate-800">
                  {tracking.destination.formattedAddress ?? '—'}
                </p>
                <p className="text-sm text-slate-500">{tracking.destination.contactName ?? ''}</p>
              </article>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-[#12355b]">Status</h2>
              <p className="mt-2 text-sm text-slate-600">
                Route {tracking.routeStatus ?? 'not assigned'} · Last update{' '}
                {formatDateTime(tracking.lastUpdatedAt)} · Estimated arrival{' '}
                {formatDateTime(tracking.estimatedArrivalAt)}
              </p>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-[#12355b]">Timeline</h2>
              {tracking.timeline.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No public tracking events yet.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {tracking.timeline.map((event, index) => (
                    <li
                      key={`${event.occurredAt}-${index}`}
                      className="border-l-2 border-teal-200 pl-3"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {event.type.replaceAll('_', ' ')}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(event.occurredAt)}</p>
                      {event.description ? (
                        <p className="text-sm text-slate-600">{event.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
        <p className="text-xs text-slate-400">
          <Link className="hover:underline" to="/login">
            Operator sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
