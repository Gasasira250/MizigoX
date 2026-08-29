import { SHIPMENT_TRANSITIONS, type ShipmentPayload, type ShipmentStatus } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiGet, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';

export function ShipmentDetailPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const { shipmentId } = useParams();
  const { user } = useAuth();
  const [shipment, setShipment] = useState<ShipmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canUpdate = user?.permissions.includes('shipments.update_status');

  async function load() {
    if (!shipmentId) {
      return;
    }
    try {
      setShipment(await apiGet<ShipmentPayload>(`/shipments/${shipmentId}`));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load shipment');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  async function changeStatus(status: ShipmentStatus) {
    if (!shipmentId) {
      return;
    }
    try {
      setShipment(await apiPost<ShipmentPayload>(`/shipments/${shipmentId}/status`, { status }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to update status');
    }
  }

  if (error && !shipment) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }
  if (!shipment) {
    return <p className="text-sm text-slate-500">Loading shipment…</p>;
  }

  const next = SHIPMENT_TRANSITIONS[shipment.status];

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to={`${basePath}/shipments`}>
          Back to shipments
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-[#12355b]">{shipment.reference}</h1>
          <StatusBadge status={shipment.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {shipment.customerName} · {shipment.operatorName}
        </p>
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-slate-500">Cargo</p>
          <p className="mt-1 text-sm">{shipment.cargoDescription}</p>
          <p className="mt-1 text-sm text-slate-500">
            {shipment.weightKg ? `${shipment.weightKg} kg` : 'Weight not set'}
            {shipment.piecesCount ? ` · ${shipment.piecesCount} pieces` : ''}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Route</p>
          <p className="mt-1 text-sm">{shipment.origin?.formattedAddress}</p>
          <p className="mt-1 text-sm">{shipment.destination?.formattedAddress}</p>
        </div>
      </section>

      {canUpdate && next.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Update status</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {next.map((status) => (
              <button
                key={status}
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => void changeStatus(status)}
              >
                Mark {status.replaceAll('_', ' ').toLowerCase()}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Timeline</h2>
        <ol className="mt-3 space-y-3">
          {shipment.events.map((event) => (
            <li key={event.id} className="border-l-2 border-slate-200 pl-3 text-sm">
              <p className="font-medium">{event.type.replaceAll('_', ' ')}</p>
              <p className="text-slate-500">
                {event.note} · {new Date(event.occurredAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
