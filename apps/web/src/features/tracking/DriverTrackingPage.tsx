import type { DriverTrackingAssignmentPayload, VehicleLocationPayload } from '@mizigox/shared';
import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../shared/api/client';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { FreshnessBadge } from './FreshnessBadge';
import { formatApiError, formatCoordinates } from './format';
import { LocationDetails } from './map/LocationDetails';

export function DriverTrackingPage() {
  const { notify } = useToast();
  const [assignment, setAssignment] = useState<DriverTrackingAssignmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const [watching, setWatching] = useState(false);
  const watchId = useRef<number | null>(null);

  async function load() {
    try {
      setAssignment(await apiGet<DriverTrackingAssignmentPayload>('/tracking/me'));
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load your assignment'));
    }
  }

  useEffect(() => {
    void load();
    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => setPermission(status.state as typeof permission))
        .catch(() => setPermission('unknown'));
    }
    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  async function submitCoords(position: GeolocationPosition) {
    const latest = await apiPost<VehicleLocationPayload>('/tracking/locations', {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy,
      speedKph:
        position.coords.speed != null && position.coords.speed >= 0
          ? position.coords.speed * 3.6
          : undefined,
      headingDegrees:
        position.coords.heading != null && position.coords.heading >= 0
          ? position.coords.heading
          : undefined,
      altitudeMeters: position.coords.altitude ?? undefined,
      deviceTimestamp: new Date(position.timestamp).toISOString(),
      source: 'DRIVER_WEB',
      deviceLabel: navigator.userAgent.slice(0, 80),
    });
    notify(`Location submitted: ${formatCoordinates(latest.latitude, latest.longitude)}`);
    await load();
  }

  function submitFromDevice() {
    if (!navigator.geolocation) {
      setGeoError('This browser does not provide location services.');
      return;
    }
    setBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await submitCoords(position);
        } catch (cause) {
          notify(formatApiError(cause, 'Unable to submit location'));
        } finally {
          setBusy(false);
        }
      },
      (cause) => {
        setBusy(false);
        setPermission('denied');
        setGeoError(
          cause.code === cause.PERMISSION_DENIED
            ? 'Location permission was denied. Enable location services to submit a real update.'
            : 'The device could not determine your location. No placeholder coordinates were sent.',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  }

  function startWatching() {
    if (!navigator.geolocation) {
      setGeoError('This browser does not provide location services.');
      return;
    }
    if (watchId.current != null) {
      return;
    }
    setWatching(true);
    setGeoError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setPermission('granted');
        void submitCoords(position).catch((cause) =>
          notify(formatApiError(cause, 'Unable to submit location')),
        );
      },
      (cause) => {
        setWatching(false);
        setGeoError(
          cause.code === cause.PERMISSION_DENIED
            ? 'Location permission was denied.'
            : 'Live location updates could not start. The browser is not pretending to track in the background.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  function stopWatching() {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setWatching(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#12355b]">Driver tracking</h1>
        <p className="mt-1 text-sm text-slate-600">
          Submit your real device location for the assigned vehicle. This web page can send updates
          while it stays open. It does not provide reliable background GPS tracking.
        </p>
      </div>
      <dl className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Location permission</dt>
          <dd className="mt-1 font-medium">{permission}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Tracking status</dt>
          <dd className="mt-1 font-medium">{watching ? 'Sending while this page is open' : 'Stopped'}</dd>
        </div>
      </dl>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {assignment ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Current assignment</h2>
          <p className="mt-2 text-sm text-slate-800">{assignment.driverName}</p>
          <div className="mt-2">
            <StatusBadge status={assignment.status} />
          </div>
          {assignment.route ? (
            <div className="mt-4 space-y-1 text-sm text-slate-700">
              <p>
                Route <span className="font-medium">{assignment.route.reference}</span>
              </p>
              <StatusBadge status={assignment.route.status} />
              <p>
                {assignment.route.origin ?? 'Origin pending'} →{' '}
                {assignment.route.destination ?? 'Destination pending'}
              </p>
              <p>Vehicle {assignment.vehicle?.registration ?? 'unassigned'}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              You are not assigned to a dispatched route, so location updates cannot be submitted.
            </p>
          )}
        </section>
      ) : null}
      <LocationDetails location={assignment?.currentLocation ?? null} />
      {assignment?.currentLocation ? (
        <FreshnessBadge freshness={assignment.currentLocation.freshness} />
      ) : null}
      {geoError ? <p className="text-sm text-red-700">{geoError}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="min-h-11 rounded-md bg-[#12355b] px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy || !assignment?.route}
          onClick={() => void submitFromDevice()}
        >
          {busy ? 'Submitting location…' : 'Submit current location'}
        </button>
        {watching ? (
          <button
            type="button"
            className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm"
            onClick={stopWatching}
          >
            Stop location tracking
          </button>
        ) : (
          <button
            type="button"
            className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
            disabled={!assignment?.route}
            onClick={startWatching}
          >
            Start location tracking
          </button>
        )}
      </div>
    </div>
  );
}
