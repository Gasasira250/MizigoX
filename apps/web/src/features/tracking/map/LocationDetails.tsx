import type { VehicleLocationPayload } from '@mizigox/shared';
import { FreshnessBadge } from '../FreshnessBadge';
import {
  formatAge,
  formatCoordinates,
  formatDateTime,
  formatHeading,
  formatSpeed,
} from '../format';

export function LocationDetails({
  location,
  title = 'Location details',
  empty = 'No authenticated location has been recorded yet.',
}: {
  location: VehicleLocationPayload | null;
  title?: string;
  empty?: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-[#12355b]">{title}</h2>
      {!location ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Item
            label="Coordinates"
            value={formatCoordinates(location.latitude, location.longitude)}
          />
          <Item label="Last update" value={formatDateTime(location.lastUpdatedAt)} />
          <Item label="Age" value={formatAge(location.ageSeconds)} />
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Freshness</dt>
            <dd className="mt-1">
              <FreshnessBadge freshness={location.freshness} />
            </dd>
          </div>
          <Item label="Speed" value={formatSpeed(location.speedKph)} />
          <Item label="Heading" value={formatHeading(location.headingDegrees)} />
          <Item label="Driver" value={location.driverName} />
          <Item label="Route" value={location.routeReference} />
          <Item label="Vehicle" value={location.vehicleRegistration ?? location.vehicleReference} />
          <Item label="Source" value={location.source.replaceAll('_', ' ')} />
        </dl>
      )}
    </article>
  );
}

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-800">{value || '—'}</dd>
    </div>
  );
}
