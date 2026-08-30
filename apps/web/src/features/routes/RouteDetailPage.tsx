import type {
  DispatchValidationPayload,
  RoutePayload,
  RouteStatus,
  RouteStopPayload,
} from '@mizigox/shared';
import {
  ROUTE_TRANSITIONS,
  canDeleteRoutes,
  canDispatchRoutes,
  canUpdateRouteStatus,
  canUpdateRoutes,
  canViewRouteHistory,
  isRouteStructurallyLocked,
  routeStatusLabel,
  routeStopTypeLabel,
  routeTypeLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DispatchConfirmDialog } from '../dispatch/DispatchConfirmDialog';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import {
  capacityWarning,
  formatApiError,
  formatDate,
  formatDuration,
  formatKg,
} from './form-utils';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConfirmState =
  | { type: 'status'; status: RouteStatus }
  | { type: 'cancel' }
  | { type: 'archive' }
  | { type: 'removeStop'; stopId: string }
  | { type: 'removeShipment'; shipmentId: string }
  | null;

export function RouteDetailPage() {
  const { routeId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canEdit = canUpdateRoutes(user?.permissions);
  const canStatus = canUpdateRouteStatus(user?.permissions);
  const canDispatch = canDispatchRoutes(user?.permissions);
  const canArchive = canDeleteRoutes(user?.permissions);
  const canHistory = canViewRouteHistory(user?.permissions);
  const [route, setRoute] = useState<RoutePayload | null>(null);
  const [validation, setValidation] = useState<DispatchValidationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [showDispatch, setShowDispatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopDraft, setStopDraft] = useState({
    stopType: 'WAYPOINT',
    formattedAddress: '',
    contactName: '',
    contactPhone: '',
    instructions: '',
  });

  async function load() {
    if (!routeId || !UUID_PATTERN.test(routeId)) {
      setError('Route not found');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const loaded = await apiGet<RoutePayload>(`/routes/${routeId}`);
      setRoute(loaded);
      setError(null);
      if (loaded.status === 'READY' && canDispatch) {
        const check = await apiGet<DispatchValidationPayload>(
          `/routes/${loaded.id}/dispatch-check`,
        );
        setValidation(check);
      } else {
        setValidation(null);
      }
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load route'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  async function runConfirmed() {
    if (!route || !confirm) {
      return;
    }
    setBusy(true);
    try {
      if (confirm.type === 'status') {
        const updated = await apiPost<RoutePayload>(`/routes/${route.id}/status`, {
          status: confirm.status,
        });
        setRoute(updated);
        notify(`${updated.reference} is now ${routeStatusLabel(updated.status).toLowerCase()}.`);
      } else if (confirm.type === 'cancel') {
        const updated = await apiPost<RoutePayload>(`/routes/${route.id}/status`, {
          status: 'CANCELLED',
        });
        setRoute(updated);
        notify(`${updated.reference} was cancelled.`);
      } else if (confirm.type === 'archive') {
        await apiDelete(`/routes/${route.id}`);
        notify(`${route.reference} was archived.`);
        navigate('/admin/routes');
      } else if (confirm.type === 'removeStop') {
        const updated = await apiDelete<RoutePayload>(
          `/routes/${route.id}/stops/${confirm.stopId}`,
        );
        setRoute(updated);
        notify('Stop removed.');
      } else {
        const updated = await apiDelete<RoutePayload>(
          `/routes/${route.id}/shipments/${confirm.shipmentId}`,
        );
        setRoute(updated);
        notify('Shipment removed from route.');
      }
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to complete that action'), 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function dispatchNow() {
    if (!route) {
      return;
    }
    setBusy(true);
    try {
      const updated = await apiPost<RoutePayload>(`/routes/${route.id}/dispatch`);
      setRoute(updated);
      setShowDispatch(false);
      notify(`${updated.reference} was dispatched.`);
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to dispatch route'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function addStop() {
    if (!route || !stopDraft.formattedAddress.trim()) {
      return;
    }
    setBusy(true);
    try {
      const updated = await apiPost<RoutePayload>(`/routes/${route.id}/stops`, {
        stopType: stopDraft.stopType,
        formattedAddress: stopDraft.formattedAddress,
        contactName: stopDraft.contactName || undefined,
        contactPhone: stopDraft.contactPhone || undefined,
        instructions: stopDraft.instructions || undefined,
      });
      setRoute(updated);
      setStopDraft({
        stopType: 'WAYPOINT',
        formattedAddress: '',
        contactName: '',
        contactPhone: '',
        instructions: '',
      });
      notify('Stop added.');
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to add stop'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function reorder(stopId: string, direction: -1 | 1) {
    if (!route) {
      return;
    }
    const ids = route.stops.map((stop) => stop.id);
    const index = ids.indexOf(stopId);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= ids.length) {
      return;
    }
    const currentId = ids[index];
    const swapId = ids[swap];
    if (!currentId || !swapId) {
      return;
    }
    ids[index] = swapId;
    ids[swap] = currentId;
    try {
      setRoute(await apiPost<RoutePayload>(`/routes/${route.id}/stops/reorder`, { stopIds: ids }));
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to reorder stops'), 'error');
    }
  }

  async function updateStopStatus(stop: RouteStopPayload, status: RouteStopPayload['status']) {
    if (!route) {
      return;
    }
    try {
      setRoute(await apiPatch<RoutePayload>(`/routes/${route.id}/stops/${stop.id}`, { status }));
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to update stop'), 'error');
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading route…</p>;
  }
  if (error || !route) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? 'Route not found'}
        </p>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/routes">
          Back to routes
        </Link>
      </div>
    );
  }

  const transitions = ROUTE_TRANSITIONS[route.status].filter((status) => status !== 'DISPATCHED');
  const locked = isRouteStructurallyLocked(route.status);
  const warning = capacityWarning(route.cargoWeightKg, route.vehicleCapacityKg);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link className="text-sm text-teal-800 hover:underline" to="/admin/routes">
            Back to routes
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-[#12355b]">{route.reference}</h1>
            <StatusBadge status={route.status} />
            <StatusBadge status={route.routeType} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {route.origin ?? 'Origin pending'} → {route.destination ?? 'Destination pending'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && !locked ? (
            <Link
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm font-medium text-white"
              to={`/admin/routes/${route.id}/edit`}
            >
              Edit route
            </Link>
          ) : null}
          <Link
            className="rounded-md border px-3 py-2 text-sm"
            to={`/admin/routes/${route.id}/timeline`}
          >
            Timeline
          </Link>
          {canDispatch && route.status === 'READY' ? (
            <button
              type="button"
              className="rounded-md bg-teal-800 px-3 py-2 text-sm text-white"
              onClick={() => setShowDispatch(true)}
            >
              Dispatch
            </button>
          ) : null}
          {canStatus && transitions.includes('CANCELLED') ? (
            <button
              type="button"
              className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700"
              onClick={() => setConfirm({ type: 'cancel' })}
            >
              Cancel route
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

      {warning ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Type" value={routeTypeLabel(route.routeType)} />
        <OverviewCard label="Planned departure" value={formatDate(route.plannedDepartureAt)} />
        <OverviewCard label="Planned arrival" value={formatDate(route.plannedArrivalAt)} />
        <OverviewCard
          label="Distance"
          value={route.distanceKm != null ? `${route.distanceKm} km` : '—'}
        />
        <OverviewCard label="Duration" value={formatDuration(route.estimatedDurationMinutes)} />
        <OverviewCard label="Actual departure" value={formatDate(route.actualDepartureAt)} />
        <OverviewCard label="Actual arrival" value={formatDate(route.actualArrivalAt)} />
        <OverviewCard label="Cargo" value={formatKg(route.cargoWeightKg)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Shipments</h2>
          {route.shipments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No shipments assigned.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {route.shipments.map((shipment) => (
                <li key={shipment.id} className="flex items-center justify-between gap-3">
                  <div>
                    <Link
                      className="font-medium text-[#12355b] hover:underline"
                      to={`/admin/shipments/${shipment.shipmentId}`}
                    >
                      {shipment.reference}
                    </Link>
                    <p className="text-sm text-slate-500">{shipment.customerName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={shipment.status} />
                    {canEdit && !locked ? (
                      <button
                        type="button"
                        className="text-xs text-red-700"
                        onClick={() =>
                          setConfirm({ type: 'removeShipment', shipmentId: shipment.shipmentId })
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Vehicle</h2>
          {route.vehicleId ? (
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-medium">
                <Link
                  className="text-[#12355b] hover:underline"
                  to={`/admin/vehicles/${route.vehicleId}`}
                >
                  {route.vehicleRegistration}
                </Link>
              </p>
              <p className="text-slate-500">{route.vehicleReference}</p>
              <p>Capacity {formatKg(route.vehicleCapacityKg)}</p>
              {route.vehicleStatus ? <StatusBadge status={route.vehicleStatus} /> : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No vehicle assigned.</p>
          )}
          <h2 className="mt-6 text-sm font-semibold text-[#12355b]">Driver</h2>
          {route.driverId ? (
            <div className="mt-3 space-y-1 text-sm">
              <p className="font-medium">
                <Link
                  className="text-[#12355b] hover:underline"
                  to={`/admin/drivers/${route.driverId}`}
                >
                  {route.driverName}
                </Link>
              </p>
              <p className="text-slate-500">{route.driverPhone}</p>
              {route.driverStatus ? <StatusBadge status={route.driverStatus} /> : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No driver assigned.</p>
          )}
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Stops</h2>
        <ol className="mt-4 space-y-3">
          {route.stops.map((stop, index) => (
            <li key={stop.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">
                  {index + 1}. {routeStopTypeLabel(stop.stopType)} · {stop.formattedAddress}
                </p>
                <StatusBadge status={stop.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {stop.contactName ?? 'No contact'} · {stop.contactPhone ?? 'No phone'}
                {stop.shipmentReference ? ` · ${stop.shipmentReference}` : ''}
              </p>
              {canEdit ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {!locked ? (
                    <>
                      <button type="button" onClick={() => void reorder(stop.id, -1)}>
                        Move up
                      </button>
                      <button type="button" onClick={() => void reorder(stop.id, 1)}>
                        Move down
                      </button>
                      <button
                        type="button"
                        className="text-red-700"
                        onClick={() => setConfirm({ type: 'removeStop', stopId: stop.id })}
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                  {(['PENDING', 'ARRIVED', 'SERVICED', 'SKIPPED'] as const)
                    .filter((status) => status !== stop.status)
                    .map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => void updateStopStatus(stop, status)}
                      >
                        Mark {status.toLowerCase()}
                      </button>
                    ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        {canEdit && !locked ? (
          <form
            className="mt-4 grid gap-2 md:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              void addStop();
            }}
          >
            <select
              className="rounded-md border px-2 py-2 text-sm"
              value={stopDraft.stopType}
              onChange={(event) =>
                setStopDraft((current) => ({ ...current, stopType: event.target.value }))
              }
            >
              <option value="PICKUP">Pickup</option>
              <option value="DELIVERY">Delivery</option>
              <option value="WAYPOINT">Waypoint</option>
              <option value="RETURN">Return</option>
            </select>
            <input
              className="rounded-md border px-2 py-2 text-sm md:col-span-2"
              placeholder="Address"
              value={stopDraft.formattedAddress}
              onChange={(event) =>
                setStopDraft((current) => ({ ...current, formattedAddress: event.target.value }))
              }
            />
            <input
              className="rounded-md border px-2 py-2 text-sm"
              placeholder="Contact"
              value={stopDraft.contactName}
              onChange={(event) =>
                setStopDraft((current) => ({ ...current, contactName: event.target.value }))
              }
            />
            <button type="submit" className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white">
              Add stop
            </button>
          </form>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Dispatch</h2>
          <p className="mt-2 text-sm text-slate-600">
            {route.dispatchedAt
              ? `Dispatched ${formatDate(route.dispatchedAt)}.`
              : 'This route has not been dispatched.'}
          </p>
          {validation ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {validation.errors.map((item) => (
                <li key={item} className="text-red-700">
                  {item}
                </li>
              ))}
              {validation.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {validation.ok ? <li>Ready for dispatch.</li> : null}
            </ul>
          ) : null}
          {canStatus ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {transitions
                .filter((status) => status !== 'CANCELLED')
                .map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-sm"
                    onClick={() => setConfirm({ type: 'status', status })}
                  >
                    Mark {routeStatusLabel(status)}
                  </button>
                ))}
            </div>
          ) : null}
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Tracking</h2>
          <p className="mt-2 text-sm text-slate-600">
            Vehicle location and freshness for this route are available on the route tracking page.
            No placeholder GPS positions are shown here.
          </p>
          <Link
            className="mt-3 inline-block text-sm text-teal-800 hover:underline"
            to={`/admin/tracking/routes/${route.id}`}
          >
            Open route tracking
          </Link>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Timeline</h2>
        {!canHistory ? (
          <p className="mt-3 text-sm text-slate-500">
            You do not have permission to view route history.
          </p>
        ) : route.events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No events recorded yet.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {route.events.map((event) => (
              <li key={event.id} className="border-l-2 border-teal-200 pl-3">
                <p className="text-sm font-medium text-slate-900">
                  {event.previousStatus && event.status
                    ? `${routeStatusLabel(event.previousStatus)} → ${routeStatusLabel(event.status)}`
                    : (event.description ?? event.type.replaceAll('_', ' '))}
                </p>
                <p className="text-xs text-slate-500">
                  {event.type.replaceAll('_', ' ')} · {formatDate(event.occurredAt)}
                  {event.actorName ? ` · ${event.actorName}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {confirm ? (
        <ConfirmDialog
          title={confirmTitle(confirm)}
          message={confirmMessage(confirm, route)}
          confirmLabel={
            confirm.type === 'cancel' || confirm.type === 'archive' ? 'Confirm' : 'Continue'
          }
          danger={confirm.type === 'cancel' || confirm.type === 'archive'}
          onCancel={() => (busy ? undefined : setConfirm(null))}
          onConfirm={() => {
            if (!busy) {
              void runConfirmed();
            }
          }}
        />
      ) : null}
      {showDispatch ? (
        <DispatchConfirmDialog
          route={route}
          busy={busy}
          onCancel={() => (busy ? undefined : setShowDispatch(false))}
          onConfirm={() => void dispatchNow()}
        />
      ) : null}
    </div>
  );
}

function OverviewCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </article>
  );
}

function confirmTitle(confirm: Exclude<ConfirmState, null>) {
  if (confirm.type === 'cancel') return 'Cancel route';
  if (confirm.type === 'archive') return 'Archive route';
  if (confirm.type === 'removeStop') return 'Remove stop';
  if (confirm.type === 'removeShipment') return 'Remove shipment';
  return 'Change route status';
}

function confirmMessage(confirm: Exclude<ConfirmState, null>, route: RoutePayload) {
  if (confirm.type === 'cancel') {
    return `Cancel ${route.reference}? Assigned vehicles and drivers will be released.`;
  }
  if (confirm.type === 'archive') {
    return `Archive ${route.reference}? Only draft or cancelled routes can be archived.`;
  }
  if (confirm.type === 'removeStop') {
    return 'Remove this stop from the route sequence?';
  }
  if (confirm.type === 'removeShipment') {
    return 'Remove this shipment from the route?';
  }
  return `Move ${route.reference} to ${routeStatusLabel(confirm.status)}?`;
}
