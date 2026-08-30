import type { ShipmentEventPayload, ShipmentPayload, ShipmentStatus } from '@mizigox/shared';
import {
  SHIPMENT_TRANSITIONS,
  canDeleteShipments,
  canUpdateShipmentStatus,
  canUpdateShipments,
  canViewShipmentHistory,
  shipmentPriorityLabel,
  shipmentStatusLabel,
  shipmentTypeLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { ShipmentTrackingPanel } from '../tracking/ShipmentTrackingPanel';
import { formatApiError, formatDate, formatStop } from './form-utils';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConfirmState =
  { type: 'status'; status: ShipmentStatus } | { type: 'cancel' } | { type: 'archive' } | null;

export function ShipmentDetailPage({ basePath }: { basePath: '/admin' | '/portal' }) {
  const { shipmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canEdit = canUpdateShipments(user?.permissions);
  const canStatus = canUpdateShipmentStatus(user?.permissions);
  const canArchive = canDeleteShipments(user?.permissions);
  const canHistory = canViewShipmentHistory(user?.permissions);
  const [shipment, setShipment] = useState<ShipmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusNote, setStatusNote] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!shipmentId || !UUID_PATTERN.test(shipmentId)) {
      setError('Shipment not found');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setShipment(await apiGet<ShipmentPayload>(`/shipments/${shipmentId}`));
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load shipment'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  const transitions = shipment ? SHIPMENT_TRANSITIONS[shipment.status] : [];
  const editable = shipment && shipment.status !== 'CANCELLED' && shipment.status !== 'DELIVERED';

  async function runConfirmed() {
    if (!shipment || !confirm) {
      return;
    }
    setBusy(true);
    try {
      if (confirm.type === 'status') {
        const updated = await apiPost<ShipmentPayload>(`/shipments/${shipment.id}/status`, {
          status: confirm.status,
          note: statusNote || undefined,
        });
        setShipment(updated);
        setStatusNote('');
        notify(`${updated.reference} is now ${shipmentStatusLabel(updated.status).toLowerCase()}.`);
      } else if (confirm.type === 'cancel') {
        const updated = await apiPost<ShipmentPayload>(`/shipments/${shipment.id}/cancel`);
        setShipment(updated);
        notify(`${updated.reference} was cancelled.`);
      } else {
        await apiDelete(`/shipments/${shipment.id}`);
        notify(`${shipment.reference} was archived.`);
        navigate(`${basePath}/shipments`);
      }
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to complete that action'), 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading shipment…</p>;
  }
  if (error || !shipment) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? 'Shipment not found'}
        </p>
        <Link className="text-sm text-teal-800 hover:underline" to={`${basePath}/shipments`}>
          Back to shipments
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link className="text-sm text-teal-800 hover:underline" to={`${basePath}/shipments`}>
            Back to shipments
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-[#12355b]">{shipment.reference}</h1>
            <StatusBadge status={shipment.status} />
            <StatusBadge status={shipment.priority} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {basePath === '/admin' ? (
              <Link
                className="hover:underline"
                to={`/admin/customers/${shipment.customerOrganizationId}`}
              >
                {shipment.customerName}
              </Link>
            ) : (
              shipment.customerName
            )}{' '}
            · {shipmentTypeLabel(shipment.shipmentType)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && editable ? (
            <Link
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm font-medium text-white"
              to={`${basePath}/shipments/${shipment.id}/edit`}
            >
              Edit shipment
            </Link>
          ) : null}
          {canStatus && editable && transitions.includes('CANCELLED') ? (
            <button
              type="button"
              className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700"
              onClick={() => setConfirm({ type: 'cancel' })}
            >
              Cancel shipment
            </button>
          ) : null}
          {canArchive ? (
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => setConfirm({ type: 'archive' })}
            >
              Archive
            </button>
          ) : null}
        </div>
      </div>

      <section className="flex flex-wrap gap-3 text-sm">
        {basePath === '/admin' ? (
          <Link
            className="text-teal-800 hover:underline"
            to={`/admin/customers/${shipment.customerOrganizationId}`}
          >
            Customer record
          </Link>
        ) : null}
        {shipment.currentRoute ? (
          <Link
            className="text-teal-800 hover:underline"
            to={
              basePath === '/admin'
                ? `/admin/routes/${shipment.currentRoute.id}`
                : `${basePath}/shipments/${shipment.id}`
            }
          >
            Route {shipment.currentRoute.reference}
          </Link>
        ) : null}
        {basePath === '/admin' ? (
          <Link
            className="text-teal-800 hover:underline"
            to={`/admin/tracking/shipments/${shipment.id}`}
          >
            Live tracking
          </Link>
        ) : (
          <Link
            className="text-teal-800 hover:underline"
            to={`/portal/shipments/${shipment.id}/track`}
          >
            Track shipment
          </Link>
        )}
        {basePath === '/admin' ? (
          <Link
            className="text-teal-800 hover:underline"
            to={`/admin/invoices?q=${encodeURIComponent(shipment.reference)}`}
          >
            Related invoices
          </Link>
        ) : (
          <Link className="text-teal-800 hover:underline" to="/portal/invoices">
            Invoices
          </Link>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Customer" value={shipment.customerName} />
        <OverviewCard label="Priority" value={shipmentPriorityLabel(shipment.priority)} />
        <OverviewCard label="Requested pickup" value={formatDate(shipment.estimatedPickupAt)} />
        <OverviewCard label="Requested delivery" value={formatDate(shipment.estimatedDeliveryAt)} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Overview</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Reference" value={shipment.reference} />
          <Item label="Status" value={shipmentStatusLabel(shipment.status)} />
          <Item label="Type" value={shipmentTypeLabel(shipment.shipmentType)} />
          <Item label="Created by" value={shipment.createdByName} />
          <Item label="Created" value={formatDate(shipment.createdAt)} />
          <Item label="Updated" value={formatDate(shipment.updatedAt)} />
          <Item label="Actual pickup" value={formatDate(shipment.actualPickupAt)} />
          <Item label="Actual delivery" value={formatDate(shipment.actualDeliveryAt)} />
        </dl>
        {shipment.description ? (
          <p className="mt-4 text-sm text-slate-600">{shipment.description}</p>
        ) : null}
        {canStatus && editable && transitions.some((status) => status !== 'CANCELLED') ? (
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <label className="block text-sm font-medium">
              Status note
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={statusNote}
                onChange={(event) => setStatusNote(event.target.value)}
                placeholder="Optional note for the timeline"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {transitions
                .filter((status) => status !== 'CANCELLED' && status !== 'DELIVERED')
                .map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => setConfirm({ type: 'status', status })}
                  >
                    Mark {shipmentStatusLabel(status).toLowerCase()}
                  </button>
                ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <StopCard title="Pickup" stop={shipment.pickup} />
        <StopCard title="Delivery" stop={shipment.delivery} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Cargo</h2>
        <p className="mt-2 text-sm text-slate-600">
          {shipment.cargoType ? `${shipment.cargoType} · ` : ''}
          {shipment.cargoDescription ?? 'No cargo description'}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {shipment.piecesCount ?? 0} package{(shipment.piecesCount ?? 0) === 1 ? '' : 's'}
          {shipment.weightKg != null ? ` · ${shipment.weightKg} kg` : ''}
          {shipment.volumeM3 != null ? ` · ${shipment.volumeM3} m³` : ''}
          {shipment.declaredValue != null
            ? ` · ${shipment.declaredValue} ${shipment.declaredCurrencyCode ?? ''}`
            : ''}
        </p>
        {shipment.specialInstructions ? (
          <p className="mt-2 text-sm text-slate-500">{shipment.specialInstructions}</p>
        ) : null}
        {shipment.items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No packages recorded.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium">Qty</th>
                  <th className="py-2 pr-4 font-medium">Weight</th>
                  <th className="py-2 pr-4 font-medium">Dimensions</th>
                  <th className="py-2 font-medium">Handling</th>
                </tr>
              </thead>
              <tbody>
                {shipment.items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4">
                      {item.description}
                      {item.isFragile ? (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                          Fragile
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{item.quantity}</td>
                    <td className="py-2 pr-4">
                      {item.weightKg != null
                        ? `${item.weightKg} ${item.weightUnit.toLowerCase()}`
                        : '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {item.lengthCm != null && item.widthCm != null && item.heightCm != null
                        ? `${item.lengthCm}×${item.widthCm}×${item.heightCm} ${item.dimensionUnit.toLowerCase()}`
                        : '—'}
                    </td>
                    <td className="py-2 text-slate-600">{item.specialHandling ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Timeline</h2>
        {!canHistory ? (
          <p className="mt-3 text-sm text-slate-500">
            You do not have permission to view shipment history.
          </p>
        ) : shipment.events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No events recorded yet.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {shipment.events.map((event: ShipmentEventPayload) => (
              <li key={event.id} className="border-l-2 border-teal-200 pl-3">
                <p className="text-sm font-medium text-slate-900">
                  {event.previousStatus && event.status
                    ? `${shipmentStatusLabel(event.previousStatus)} → ${shipmentStatusLabel(event.status)}`
                    : event.status
                      ? shipmentStatusLabel(event.status)
                      : event.type.replaceAll('_', ' ')}
                </p>
                <p className="text-xs text-slate-500">
                  {event.type.replaceAll('_', ' ')} · {formatDate(event.occurredAt)}
                  {event.actorName ? ` · ${event.actorName}` : ''}
                  {event.location ? ` · ${event.location}` : ''}
                </p>
                {event.note ? <p className="text-sm text-slate-600">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Tracking</h2>
        <div className="mt-4">
          <ShipmentTrackingPanel shipmentId={shipment.id} basePath={basePath} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Documents</h2>
          <p className="mt-2 text-sm text-slate-500">
            Waybills, commercial invoices, and proof of delivery will be attached here in a later
            phase.
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Assignment</h2>
          {shipment.currentRoute ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-slate-900">{shipment.currentRoute.reference}</p>
              <StatusBadge status={shipment.currentRoute.status} />
              {basePath === '/admin' ? (
                <p>
                  <Link
                    className="text-teal-800 hover:underline"
                    to={`/admin/routes/${shipment.currentRoute.id}`}
                  >
                    View route
                  </Link>
                </p>
              ) : (
                <p className="text-slate-500">Assigned to an active route.</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              This shipment is not assigned to an active route.
            </p>
          )}
        </article>
      </section>

      {confirm ? (
        <ConfirmDialog
          title={confirmTitle(confirm, shipment)}
          message={confirmMessage(confirm, shipment)}
          confirmLabel={confirmLabel(confirm)}
          danger={confirm.type === 'cancel' || confirm.type === 'archive'}
          onCancel={() => (busy ? undefined : setConfirm(null))}
          onConfirm={() => {
            if (!busy) {
              void runConfirmed();
            }
          }}
        />
      ) : null}
    </div>
  );
}

function StopCard({ title, stop }: { title: string; stop: ShipmentPayload['pickup'] }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-[#12355b]">{title}</h2>
      <p className="mt-3 font-medium text-slate-800">{stop.contactName ?? 'No contact name'}</p>
      <p className="text-sm text-slate-600">{stop.phoneE164 ?? 'No phone'}</p>
      <p className="mt-2 text-sm text-slate-700">{formatStop(stop)}</p>
      {stop.address?.latitude != null && stop.address?.longitude != null ? (
        <p className="mt-1 text-xs text-slate-500">
          {stop.address.latitude}, {stop.address.longitude}
        </p>
      ) : null}
      {stop.instructions ? (
        <p className="mt-2 text-sm text-slate-500">{stop.instructions}</p>
      ) : null}
    </article>
  );
}

function OverviewCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-800">{value}</p>
    </article>
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

function confirmTitle(confirm: Exclude<ConfirmState, null>, shipment: ShipmentPayload) {
  if (confirm.type === 'archive') return `Archive ${shipment.reference}?`;
  if (confirm.type === 'cancel') return `Cancel ${shipment.reference}?`;
  return `Update ${shipment.reference} status?`;
}

function confirmMessage(confirm: Exclude<ConfirmState, null>, shipment: ShipmentPayload) {
  if (confirm.type === 'archive') {
    return 'Only draft, cancelled, or delivered shipments can be archived. Archived shipments leave the active list.';
  }
  if (confirm.type === 'cancel') {
    return 'Cancellation cannot be reversed from the operations UI. A history event will be recorded.';
  }
  return `Move this shipment from ${shipmentStatusLabel(shipment.status)} to ${shipmentStatusLabel(confirm.status)}?`;
}

function confirmLabel(confirm: Exclude<ConfirmState, null>) {
  if (confirm.type === 'archive') return 'Archive';
  if (confirm.type === 'cancel') return 'Cancel shipment';
  return 'Update status';
}
