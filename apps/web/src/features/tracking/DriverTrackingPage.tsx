import type { DriverTrackingAssignmentPayload, VehicleLocationPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
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
  }, []);

  async function submitFromDevice() {
    if (!navigator.geolocation) {
      setGeoError('This browser does not provide location services.');
      return;
    }
    setBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
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
        } catch (cause) {
          notify(formatApiError(cause, 'Unable to submit location'));
        } finally {
          setBusy(false);
        }
      },
      (cause) => {
        setBusy(false);
        setGeoError(
          cause.code === cause.PERMISSION_DENIED
            ? 'Location permission was denied. Enable location services to submit a real update.'
            : 'The device could not determine your location. No placeholder coordinates were sent.',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#12355b]">Driver tracking</h1>
        <p className="mt-1 text-sm text-slate-600">
          Submit your real device location for the assigned vehicle. MizigoX does not invent GPS
          coordinates.
        </p>
      </div>
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
      <button
        type="button"
        className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={busy || !assignment?.route}
        onClick={() => void submitFromDevice()}
      >
        {busy ? 'Submitting location…' : 'Submit current location'}
      </button>
    </div>
  );
}
