import type {
  LiveTrackingDashboardPayload,
  TrackingConfigPayload,
  VehicleLocationPayload,
} from '@mizigox/shared';
import { TRACKING_FRESHNESS_STATES } from '@mizigox/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { FreshnessBadge } from './FreshnessBadge';
import { formatAge, formatApiError, formatCoordinates, formatDateTime } from './format';
import { LocationDetails } from './map/LocationDetails';
import { MapView } from './map/MapView';
import { useTrackingStream } from './useTrackingStream';

interface OrganizationOption {
  id: string;
  name: string;
  type: string;
}

export function LiveTrackingPage() {
  const { user } = useAuth();
  const [data, setData] = useState<LiveTrackingDashboardPayload | null>(null);
  const [config, setConfig] = useState<TrackingConfigPayload | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [status, setStatus] = useState('');
  const [freshness, setFreshness] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (organizationId) params.set('organizationId', organizationId);
    if (vehicleId) params.set('vehicleId', vehicleId);
    if (driverId) params.set('driverId', driverId);
    if (routeId) params.set('routeId', routeId);
    if (shipmentId) params.set('shipmentId', shipmentId);
    if (status) params.set('status', status);
    if (freshness) params.set('freshness', freshness);
    const query = params.toString();
    try {
      const [dashboard, trackingConfig] = await Promise.all([
        apiGet<LiveTrackingDashboardPayload>(`/tracking/live${query ? `?${query}` : ''}`),
        apiGet<TrackingConfigPayload>('/tracking/config'),
      ]);
      setData(dashboard);
      setConfig(trackingConfig);
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load live tracking'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, vehicleId, driverId, routeId, shipmentId, status, freshness]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (user?.orgType !== 'PLATFORM') {
      return;
    }
    void apiGet<OrganizationOption[]>('/organizations')
      .then((rows) => setOrganizations(rows.filter((row) => row.type === 'OPERATOR')))
      .catch(() => setOrganizations([]));
  }, [user?.orgType]);

  const applyStream = useCallback((payload: VehicleLocationPayload) => {
    setData((current) => {
      if (!current) {
        return current;
      }
      const others = current.vehicles.filter((item) => item.vehicleId !== payload.vehicleId);
      return { ...current, vehicles: [payload, ...others] };
    });
  }, []);
  useTrackingStream(Boolean(data), applyStream);

  const selected = data?.vehicles.find((item) => item.vehicleId === selectedId) ?? null;
  const mapVehicles = useMemo(
    () =>
      (data?.vehicles ?? []).map((vehicle) => ({
        id: vehicle.vehicleId,
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        label: vehicle.vehicleRegistration ?? vehicle.vehicleReference ?? 'Vehicle',
        kind: 'vehicle' as const,
        freshness: vehicle.freshness,
        subtitle: vehicle.driverName ?? vehicle.routeReference ?? undefined,
      })),
    [data?.vehicles],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#12355b]">Live tracking</h1>
        <p className="mt-1 text-sm text-slate-600">
          Authenticated vehicle locations only. Old updates are marked stale or offline using
          configurable freshness thresholds
          {config
            ? ` (${config.thresholds.liveSeconds}s live / ${config.thresholds.recentSeconds}s recent / ${config.thresholds.staleSeconds}s stale)`
            : ''}
          .
        </p>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        {user?.orgType === 'PLATFORM' ? (
          <label className="text-sm">
            Organization
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              <option value="">All authorized</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm">
          Vehicle
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            <option value="">All vehicles</option>
            {(data?.vehicles ?? []).map((vehicle) => (
              <option key={vehicle.vehicleId} value={vehicle.vehicleId}>
                {vehicle.vehicleRegistration ?? vehicle.vehicleReference}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Route
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
            value={routeId}
            onChange={(event) => setRouteId(event.target.value)}
          >
            <option value="">All routes</option>
            {(data?.activeRoutes ?? []).map((route) => (
              <option key={route.id} value={route.id}>
                {route.reference}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Shipment
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
            value={shipmentId}
            onChange={(event) => setShipmentId(event.target.value)}
          >
            <option value="">All shipments</option>
            {(data?.activeShipments ?? []).map((shipment) => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.reference}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Route status
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Any</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="IN_TRANSIT">In transit</option>
            <option value="ARRIVED">Arrived</option>
          </select>
        </label>
        <label className="text-sm">
          Freshness
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
            value={freshness}
            onChange={(event) => setFreshness(event.target.value)}
          >
            <option value="">Any</option>
            {TRACKING_FRESHNESS_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Driver
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            <option value="">All drivers</option>
            {(data?.vehicles ?? [])
              .filter((vehicle) => vehicle.driverId)
              .map((vehicle) => (
                <option key={vehicle.driverId} value={vehicle.driverId ?? ''}>
                  {vehicle.driverName}
                </option>
              ))}
          </select>
        </label>
      </form>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-500">Loading live tracking…</p> : null}

      <MapView
        provider={data?.map.provider ?? config?.map.provider ?? 'osm'}
        publicKey={data?.map.publicKey ?? config?.map.publicKey ?? null}
        vehicles={mapVehicles}
        stops={[]}
        shipments={[]}
        path={[]}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <LocationDetails location={selected} title="Selected vehicle" />

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Vehicles in transit</h2>
          {(data?.vehicles.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No current vehicle locations. Waiting for authenticated driver or device updates.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data?.vehicles.map((vehicle) => (
                <li key={vehicle.vehicleId}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedId(vehicle.vehicleId)}
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {vehicle.vehicleRegistration ?? vehicle.vehicleReference}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCoordinates(vehicle.latitude, vehicle.longitude)} ·{' '}
                      {formatAge(vehicle.ageSeconds)}
                    </p>
                    <FreshnessBadge freshness={vehicle.freshness} />
                  </button>
                  <Link
                    className="mt-1 inline-block text-xs text-teal-800 hover:underline"
                    to={`/admin/tracking/vehicles/${vehicle.vehicleId}`}
                  >
                    Vehicle tracking
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Active routes</h2>
          {(data?.activeRoutes.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No dispatched routes right now.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data?.activeRoutes.map((route) => (
                <li key={route.id}>
                  <Link className="text-sm font-medium text-teal-800 hover:underline" to={`/admin/tracking/routes/${route.id}`}>
                    {route.reference}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {route.driverName ?? 'No driver'} · {route.shipmentCount} shipment
                    {route.shipmentCount === 1 ? '' : 's'}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <StatusBadge status={route.status} />
                    <FreshnessBadge freshness={route.freshness} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Active shipments</h2>
          {(data?.activeShipments.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No in-progress shipments.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data?.activeShipments.map((shipment) => (
                <li key={shipment.id}>
                  <Link
                    className="text-sm font-medium text-teal-800 hover:underline"
                    to={`/admin/tracking/shipments/${shipment.id}`}
                  >
                    {shipment.reference}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {shipment.customerName}
                    {shipment.routeReference ? ` · ${shipment.routeReference}` : ''}
                  </p>
                  <StatusBadge status={shipment.status} />
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
      <p className="text-xs text-slate-400">Last dashboard refresh {formatDateTime(new Date().toISOString())}.</p>
    </div>
  );
}
