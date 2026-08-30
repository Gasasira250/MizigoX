import type {
  AuthenticatedShipmentTrackingPayload,
  ShipmentTrackingTokenPayload,
  TrackingConfigPayload,
} from '@mizigox/shared';
import { canManageTracking } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDelete, apiGet, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { FreshnessBadge } from './FreshnessBadge';
import { formatApiError, formatDateTime } from './format';
import { LocationDetails } from './map/LocationDetails';
import { MapView } from './map/MapView';

export function ShipmentTrackingPanel({
  shipmentId,
  basePath,
}: {
  shipmentId: string;
  basePath: '/admin' | '/portal';
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const canManage = canManageTracking(user?.permissions) && basePath === '/admin';
  const [tracking, setTracking] = useState<AuthenticatedShipmentTrackingPayload | null>(null);
  const [config, setConfig] = useState<TrackingConfigPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [record, trackingConfig] = await Promise.all([
        apiGet<AuthenticatedShipmentTrackingPayload>(`/tracking/shipments/${shipmentId}`),
        apiGet<TrackingConfigPayload>('/tracking/config'),
      ]);
      setTracking(record);
      setConfig(trackingConfig);
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load shipment tracking'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  async function issueToken() {
    setBusy(true);
    try {
      const issued = await apiPost<ShipmentTrackingTokenPayload>(
        `/tracking/shipments/${shipmentId}/token`,
      );
      setIssuedToken(issued.token);
      notify('A new customer tracking link was issued. Copy it now; it will not be shown again.');
      await load();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to issue tracking token'));
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken() {
    setBusy(true);
    try {
      await apiDelete(`/tracking/shipments/${shipmentId}/token`);
      setIssuedToken(null);
      notify('The public tracking link was revoked.');
      await load();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to revoke tracking token'));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!tracking) {
    return <p className="text-sm text-slate-500">Loading shipment tracking…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={tracking.status} />
        {tracking.currentLocation ? (
          <FreshnessBadge freshness={tracking.currentLocation.freshness} />
        ) : null}
        {tracking.route && basePath === '/admin' ? (
          <Link
            className="text-sm text-teal-800 hover:underline"
            to={`/admin/tracking/routes/${tracking.route.id}`}
          >
            {tracking.route.reference}
          </Link>
        ) : tracking.route ? (
          <span className="text-sm text-slate-600">{tracking.route.reference}</span>
        ) : null}
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
                  label: tracking.currentLocation.vehicleRegistration ?? 'Vehicle',
                  kind: 'vehicle',
                  freshness: tracking.currentLocation.freshness,
                },
              ]
            : []
        }
        stops={[]}
        shipments={
          tracking.currentLocation
            ? [
                {
                  id: tracking.shipmentId,
                  latitude: tracking.currentLocation.latitude,
                  longitude: tracking.currentLocation.longitude,
                  label: tracking.reference,
                  kind: 'shipment',
                },
              ]
            : []
        }
        path={[]}
        selectedId={null}
        onSelect={() => undefined}
      />
      <LocationDetails
        location={tracking.currentLocation}
        empty="No vehicle location is available for this shipment yet."
      />
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <Item label="Pickup" value={tracking.pickupAddress} />
        <Item label="Destination" value={tracking.destinationAddress} />
        <Item label="Estimated arrival" value={formatDateTime(tracking.estimatedArrivalAt)} />
        <Item label="Last update" value={formatDateTime(tracking.lastUpdatedAt)} />
      </dl>
      <section>
        <h3 className="text-sm font-semibold text-[#12355b]">Tracking timeline</h3>
        {tracking.events.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No tracking events yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {tracking.events.map((event) => (
              <li key={event.id} className="border-l-2 border-teal-200 pl-3">
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
      {canManage ? (
        <section className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-[#12355b]">Customer tracking link</h3>
          <p className="mt-2 text-sm text-slate-600">
            Public tracking uses an opaque token, not the shipment database id. The raw token is
            shown only when issued or regenerated.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {tracking.hasActiveTrackingToken
              ? `Active link ending in …${tracking.trackingTokenHint}`
              : 'No active tracking link.'}
          </p>
          {issuedToken ? (
            <p className="mt-2 break-all rounded-md bg-slate-50 p-2 text-xs text-slate-800">
              {`${window.location.origin}/track/${issuedToken}`}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-[#12355b] px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void issueToken()}
            >
              {tracking.hasActiveTrackingToken ? 'Regenerate link' : 'Issue tracking link'}
            </button>
            {tracking.hasActiveTrackingToken ? (
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => void revokeToken()}
              >
                Revoke
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-800">{value || '—'}</dd>
    </div>
  );
}
