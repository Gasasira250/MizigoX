import type { DispatchBoardPayload, DispatchValidationPayload, RoutePayload } from '@mizigox/shared';
import { canCreateRoutes, canDispatchRoutes, canManageDispatch } from '@mizigox/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { formatApiError, formatDate, formatKg } from '../routes/form-utils';
import { DispatchConfirmDialog } from './DispatchConfirmDialog';

export function DispatchBoardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canCreate = canCreateRoutes(user?.permissions);
  const canDispatch = canDispatchRoutes(user?.permissions);
  const canManage = canManageDispatch(user?.permissions);
  const [board, setBoard] = useState<DispatchBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedShipments, setSelectedShipments] = useState<string[]>([]);
  const [assigningRouteId, setAssigningRouteId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [dispatchRoute, setDispatchRoute] = useState<RoutePayload | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setBoard(await apiGet<DispatchBoardPayload>('/dispatch/board'));
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load dispatch board'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleShipment(id: string) {
    setSelectedShipments((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function startPlanning() {
    const params = new URLSearchParams();
    selectedShipments.forEach((id) => params.append('shipmentId', id));
    navigate(`/admin/routes/new?${params.toString()}`);
  }

  async function assignFleet(routeId: string) {
    setBusy(true);
    try {
      await apiPatch(`/routes/${routeId}`, {
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
      });
      notify('Vehicle and driver assignment saved.');
      setAssigningRouteId(null);
      setVehicleId('');
      setDriverId('');
      await load();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to assign fleet'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function markReady(routeId: string) {
    setBusy(true);
    try {
      await apiPost(`/routes/${routeId}/status`, { status: 'READY' });
      notify('Route marked ready for dispatch.');
      await load();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to mark route ready'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openDispatch(route: RoutePayload) {
    try {
      const check = await apiGet<DispatchValidationPayload>(`/dispatch/routes/${route.id}/validate`);
      if (!check.ok) {
        notify(check.errors[0] ?? 'Route is not ready for dispatch', 'error');
        return;
      }
      setDispatchRoute(route);
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to validate route'), 'error');
    }
  }

  async function confirmDispatch() {
    if (!dispatchRoute) {
      return;
    }
    setBusy(true);
    try {
      const updated = await apiPost<RoutePayload>(`/dispatch/routes/${dispatchRoute.id}`);
      notify(`${updated.reference} was dispatched.`);
      setDispatchRoute(null);
      await load();
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to dispatch route'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading dispatch board…</p>;
  }
  if (error || !board) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 7</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Dispatch board</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Assign ready shipments to available vehicles and drivers, then dispatch planned routes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => void load()}
          >
            Refresh
          </button>
          {canCreate ? (
            <button
              type="button"
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white disabled:opacity-40"
              disabled={selectedShipments.length === 0}
              onClick={startPlanning}
            >
              Plan selected shipments
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BoardCard title="Unassigned shipments" empty="No ready shipments waiting for a route.">
          {board.unassignedShipments.map((shipment) => (
            <label
              key={shipment.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 p-3"
            >
              <input
                type="checkbox"
                checked={selectedShipments.includes(shipment.id)}
                onChange={() => toggleShipment(shipment.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-[#12355b]">{shipment.reference}</span>
                  <StatusBadge status={shipment.status} />
                </span>
                <span className="block text-sm text-slate-500">{shipment.customerName}</span>
                <span className="block truncate text-sm text-slate-600">
                  {shipment.origin ?? '—'} → {shipment.destination ?? '—'}
                </span>
                <span className="text-xs text-slate-500">
                  {formatKg(shipment.weightKg)} · pickup {formatDate(shipment.estimatedPickupAt)}
                </span>
              </span>
            </label>
          ))}
        </BoardCard>

        <BoardCard title="Planned routes" empty="No draft, planned, or ready routes.">
          {board.plannedRoutes.map((route) => (
            <article key={route.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link className="font-medium text-[#12355b] hover:underline" to={`/admin/routes/${route.id}`}>
                  {route.reference}
                </Link>
                <StatusBadge status={route.status} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {route.origin ?? '—'} → {route.destination ?? '—'}
              </p>
              <p className="text-xs text-slate-500">
                {route.shipmentCount} shipment{route.shipmentCount === 1 ? '' : 's'} ·{' '}
                {route.vehicleRegistration ?? 'No vehicle'} · {route.driverName ?? 'No driver'}
              </p>
              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs"
                    onClick={() => {
                      setAssigningRouteId(route.id);
                      setVehicleId(route.vehicleId ?? '');
                      setDriverId(route.driverId ?? '');
                    }}
                  >
                    Assign fleet
                  </button>
                  {route.status === 'PLANNED' ? (
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs"
                      onClick={() => void markReady(route.id)}
                    >
                      Mark ready
                    </button>
                  ) : null}
                  {canDispatch && route.status === 'READY' ? (
                    <button
                      type="button"
                      className="rounded-md bg-teal-800 px-2 py-1 text-xs text-white"
                      onClick={() => void openDispatch(route)}
                    >
                      Dispatch
                    </button>
                  ) : null}
                </div>
              ) : null}
              {assigningRouteId === route.id ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    value={vehicleId}
                    onChange={(event) => setVehicleId(event.target.value)}
                  >
                    <option value="">Select vehicle</option>
                    {board.availableVehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.registrationNumber} · {formatKg(vehicle.payloadCapacity)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    value={driverId}
                    onChange={(event) => setDriverId(event.target.value)}
                  >
                    <option value="">Select driver</option>
                    {board.availableDrivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.firstName} {driver.lastName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-md bg-[#12355b] px-2 py-1 text-xs text-white"
                    disabled={busy}
                    onClick={() => void assignFleet(route.id)}
                  >
                    Save assignment
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </BoardCard>

        <BoardCard title="Available vehicles" empty="No available vehicles.">
          {board.availableVehicles.map((vehicle) => (
            <article key={vehicle.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{vehicle.registrationNumber}</p>
                <StatusBadge status={vehicle.status} />
              </div>
              <p className="text-slate-500">
                {vehicle.vehicleTypeName} · {formatKg(vehicle.payloadCapacity)} {vehicle.payloadUnit}
              </p>
            </article>
          ))}
        </BoardCard>

        <BoardCard title="Available drivers" empty="No available drivers.">
          {board.availableDrivers.map((driver) => (
            <article key={driver.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {driver.firstName} {driver.lastName}
                </p>
                <StatusBadge status={driver.status} />
              </div>
              <p className="text-slate-500">{driver.phoneE164}</p>
            </article>
          ))}
        </BoardCard>
      </div>

      {dispatchRoute ? (
        <DispatchConfirmDialog
          route={dispatchRoute}
          busy={busy}
          onCancel={() => setDispatchRoute(null)}
          onConfirm={() => void confirmDispatch()}
        />
      ) : null}
    </div>
  );
}

function BoardCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-[#12355b]">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.filter(Boolean).length === 0 ? (
          <p className="text-sm text-slate-500">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
