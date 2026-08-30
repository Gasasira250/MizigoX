import type { RoutePayload } from '@mizigox/shared';
import { formatDate, formatKg } from '../routes/form-utils';

export function DispatchConfirmDialog({
  route,
  busy,
  onConfirm,
  onCancel,
}: {
  route: RoutePayload;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-[#12355b]">Confirm dispatch</h2>
        <p className="mt-2 text-sm text-slate-600">
          Dispatching commits the vehicle and driver and locks structural route changes.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Route</dt>
            <dd className="font-medium text-slate-900">{route.reference}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-slate-900">{route.status.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Vehicle</dt>
            <dd className="font-medium text-slate-900">
              {route.vehicleRegistration ?? 'Not assigned'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Driver</dt>
            <dd className="font-medium text-slate-900">{route.driverName ?? 'Not assigned'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Cargo weight</dt>
            <dd className="font-medium text-slate-900">{formatKg(route.cargoWeightKg)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Vehicle capacity</dt>
            <dd className="font-medium text-slate-900">{formatKg(route.vehicleCapacityKg)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Planned departure</dt>
            <dd className="font-medium text-slate-900">{formatDate(route.plannedDepartureAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Planned arrival</dt>
            <dd className="font-medium text-slate-900">{formatDate(route.plannedArrivalAt)}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shipments</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {route.shipments.map((shipment) => (
              <li key={shipment.id}>
                {shipment.reference} · {shipment.customerName}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white hover:bg-[#0d2743] disabled:opacity-60"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Dispatching…' : 'Dispatch route'}
          </button>
        </div>
      </div>
    </div>
  );
}
