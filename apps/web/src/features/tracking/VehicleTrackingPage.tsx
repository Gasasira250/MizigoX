import type {
  LocationRecordPayload,
  TrackingConfigPayload,
  VehicleLocationPayload,
  VehiclePayload,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiGetWithMeta } from '../../shared/api/client';
import { LocationDetails } from './map/LocationDetails';
import { MapView } from './map/MapView';
import { RoutePathSummary } from './map/RoutePath';
import { formatApiError, formatCoordinates, formatDateTime } from './format';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function VehicleTrackingPage() {
  const { vehicleId } = useParams();
  const [vehicle, setVehicle] = useState<VehiclePayload | null>(null);
  const [location, setLocation] = useState<VehicleLocationPayload | null>(null);
  const [history, setHistory] = useState<LocationRecordPayload[]>([]);
  const [config, setConfig] = useState<TrackingConfigPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId || !UUID_PATTERN.test(vehicleId)) {
      setError('Vehicle not found');
      return;
    }
    void Promise.all([
      apiGet<VehiclePayload>(`/vehicles/${vehicleId}`),
      apiGet<VehicleLocationPayload | null>(`/tracking/vehicles/${vehicleId}/location`),
      apiGetWithMeta<LocationRecordPayload[]>(
        `/tracking/vehicles/${vehicleId}/history?pageSize=50`,
      ),
      apiGet<TrackingConfigPayload>('/tracking/config'),
    ])
      .then(([record, latest, path, trackingConfig]) => {
        setVehicle(record);
        setLocation(latest);
        setHistory(path.data);
        setConfig(trackingConfig);
        setError(null);
      })
      .catch((cause) => setError(formatApiError(cause, 'Unable to load vehicle tracking')));
  }, [vehicleId]);

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!vehicle) {
    return <p className="text-sm text-slate-500">Loading vehicle tracking…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Vehicle tracking</p>
        <h1 className="text-2xl font-semibold text-[#12355b]">{vehicle.registrationNumber}</h1>
        <p className="mt-1 text-sm text-slate-600">
          <Link className="text-teal-800 hover:underline" to={`/admin/vehicles/${vehicle.id}`}>
            Vehicle details
          </Link>
          {location?.routeId ? (
            <>
              {' · '}
              <Link
                className="text-teal-800 hover:underline"
                to={`/admin/tracking/routes/${location.routeId}`}
              >
                Route tracking
              </Link>
            </>
          ) : null}
        </p>
      </div>
      <MapView
        provider={config?.map.provider ?? 'osm'}
        publicKey={config?.map.publicKey ?? null}
        vehicles={
          location
            ? [
                {
                  id: location.vehicleId,
                  latitude: location.latitude,
                  longitude: location.longitude,
                  label: vehicle.registrationNumber,
                  kind: 'vehicle',
                  freshness: location.freshness,
                  subtitle: location.driverName ?? undefined,
                },
              ]
            : []
        }
        stops={[]}
        shipments={[]}
        path={history
          .slice()
          .reverse()
          .map((point) => ({ latitude: point.latitude, longitude: point.longitude }))}
        selectedId={location?.vehicleId ?? null}
        onSelect={() => undefined}
      />
      <LocationDetails location={location} />
      <RoutePathSummary
        path={history.map((point) => ({ latitude: point.latitude, longitude: point.longitude }))}
      />
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Location history</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No historical locations recorded for this vehicle.
          </p>
        ) : (
          <ol className="mt-4 space-y-2 text-sm">
            {history.map((point) => (
              <li key={point.id} className="border-l-2 border-teal-200 pl-3">
                <p className="font-medium text-slate-900">
                  {formatCoordinates(point.latitude, point.longitude)}
                </p>
                <p className="text-xs text-slate-500">
                  Device {formatDateTime(point.deviceTimestamp)} · Received{' '}
                  {formatDateTime(point.receivedAt)} · {point.source.replaceAll('_', ' ')}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
