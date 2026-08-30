import type {
  DispatchBoardPayload,
  RoutePayload,
  RouteStopType,
  RouteType,
  ShipmentPayload,
} from '@mizigox/shared';
import { isRouteStructurallyLocked, routeStopTypeLabel, weightToKg } from '@mizigox/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiGet, apiGetWithMeta, apiPatch, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import {
  capacityWarning,
  formatApiError,
  formatDate,
  formatKg,
  routeTypeOptions,
  stopTypeOptions,
  toIsoDateTime,
  toLocalInput,
} from './form-utils';

const STEPS = ['Shipments', 'Review', 'Stops', 'Vehicle', 'Driver', 'Save'] as const;

interface StopDraft {
  key: string;
  stopType: RouteStopType;
  formattedAddress: string;
  contactName: string;
  contactPhone: string;
  instructions: string;
  shipmentId?: string;
}

function emptyStop(type: RouteStopType = 'WAYPOINT'): StopDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    stopType: type,
    formattedAddress: '',
    contactName: '',
    contactPhone: '',
    instructions: '',
  };
}

export function RouteFormPage() {
  const { routeId } = useParams();
  const [searchParams] = useSearchParams();
  const editing = Boolean(routeId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RoutePayload | null>(null);
  const [board, setBoard] = useState<DispatchBoardPayload | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    searchParams.getAll('shipmentId').filter(Boolean),
  );
  const [selectedShipments, setSelectedShipments] = useState<ShipmentPayload[]>([]);
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [routeType, setRouteType] = useState<RouteType>('STANDARD');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [plannedDepartureAt, setPlannedDepartureAt] = useState('');
  const [plannedArrivalAt, setPlannedArrivalAt] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [notes, setNotes] = useState('');

  const locked = route ? isRouteStructurallyLocked(route.status) : false;

  useEffect(() => {
    apiGet<DispatchBoardPayload>('/dispatch/board')
      .then(setBoard)
      .catch(() => setBoard(null));
  }, []);

  useEffect(() => {
    if (!routeId) {
      return;
    }
    setLoading(true);
    apiGet<RoutePayload>(`/routes/${routeId}`)
      .then((loaded) => {
        setRoute(loaded);
        setRouteType(loaded.routeType);
        setVehicleId(loaded.vehicleId ?? '');
        setDriverId(loaded.driverId ?? '');
        setPlannedDepartureAt(toLocalInput(loaded.plannedDepartureAt));
        setPlannedArrivalAt(toLocalInput(loaded.plannedArrivalAt));
        setDistanceKm(loaded.distanceKm != null ? String(loaded.distanceKm) : '');
        setDurationMinutes(
          loaded.estimatedDurationMinutes != null ? String(loaded.estimatedDurationMinutes) : '',
        );
        setNotes(loaded.notes ?? '');
        setSelectedIds(loaded.shipments.map((item) => item.shipmentId));
        setStops(
          loaded.stops.map((stop) => ({
            key: stop.id,
            stopType: stop.stopType,
            formattedAddress: stop.formattedAddress,
            contactName: stop.contactName ?? '',
            contactPhone: stop.contactPhone ?? '',
            instructions: stop.instructions ?? '',
            shipmentId: stop.shipmentId ?? undefined,
          })),
        );
      })
      .catch((cause) => setError(formatApiError(cause, 'Unable to load route')))
      .finally(() => setLoading(false));
  }, [routeId]);

  useEffect(() => {
    if (editing) {
      return;
    }
    void Promise.all(
      selectedIds.map((id) => apiGet<ShipmentPayload>(`/shipments/${id}`).catch(() => null)),
    ).then((rows) => {
      const shipments = rows.filter((row): row is ShipmentPayload => Boolean(row));
      setSelectedShipments(shipments);
      if (stops.length === 0) {
        setStops(stopsFromShipments(shipments));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(','), editing]);

  const cargoWeightKg = useMemo(() => {
    if (route) {
      return route.cargoWeightKg;
    }
    return selectedShipments.reduce((sum, shipment) => sum + (shipment.weightKg ?? 0), 0);
  }, [route, selectedShipments]);

  const vehicleChoices = [
    ...(route?.vehicleId
      ? [
          {
            id: route.vehicleId,
            registrationNumber: route.vehicleRegistration ?? route.vehicleReference ?? 'Assigned vehicle',
            vehicleTypeName: 'Current assignment',
            payloadCapacity: route.vehicleCapacityKg,
            payloadUnit: 'KG',
            status: route.vehicleStatus ?? 'ASSIGNED',
          },
        ]
      : []),
    ...(board?.availableVehicles ?? []).filter((item) => item.id !== route?.vehicleId),
  ];
  const driverChoices = [
    ...(route?.driverId
      ? [
          {
            id: route.driverId,
            firstName: route.driverName ?? 'Assigned',
            lastName: '',
            phoneE164: route.driverPhone ?? '',
            status: route.driverStatus ?? 'ASSIGNED',
          },
        ]
      : []),
    ...(board?.availableDrivers ?? []).filter((item) => item.id !== route?.driverId),
  ];
  const selectedVehicle = vehicleChoices.find((item) => item.id === vehicleId);
  const selectedDriver = driverChoices.find((item) => item.id === driverId);
  const vehicleCapacityKg = selectedVehicle
    ? weightToKg(selectedVehicle.payloadCapacity, selectedVehicle.payloadUnit)
    : (route?.vehicleCapacityKg ?? null);
  const warning = capacityWarning(cargoWeightKg, vehicleCapacityKg);

  function toggleShipment(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setStops([]);
  }

  function moveStop(index: number, direction: -1 | 1) {
    const next = [...stops];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) {
      return;
    }
    [next[index], next[swap]] = [next[swap], next[index]];
    setStops(next);
  }

  async function save(status?: 'DRAFT' | 'PLANNED') {
    setSaving(true);
    setError(null);
    try {
      if (editing && route) {
        const updated = await apiPatch<RoutePayload>(`/routes/${route.id}`, {
          routeType,
          vehicleId: vehicleId || null,
          driverId: driverId || null,
          plannedDepartureAt: toIsoDateTime(plannedDepartureAt) ?? null,
          plannedArrivalAt: toIsoDateTime(plannedArrivalAt) ?? null,
          distanceKm: distanceKm ? Number(distanceKm) : null,
          estimatedDurationMinutes: durationMinutes ? Number(durationMinutes) : null,
          notes: notes || null,
        });
        notify(`${updated.reference} was updated.`);
        navigate(`/admin/routes/${updated.id}`);
        return;
      }

      const organizationId =
        user?.organization.type === 'PLATFORM'
          ? selectedShipments[0]?.operatorOrganizationId
          : undefined;
      const created = await apiPost<RoutePayload>('/routes', {
        organizationId,
        routeType,
        shipmentIds: selectedIds,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
        plannedDepartureAt: toIsoDateTime(plannedDepartureAt),
        plannedArrivalAt: toIsoDateTime(plannedArrivalAt),
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
        estimatedDurationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        notes: notes || undefined,
        status,
        stops: stops
          .filter((stop) => stop.formattedAddress.trim())
          .map((stop) => ({
            stopType: stop.stopType,
            formattedAddress: stop.formattedAddress,
            contactName: stop.contactName || undefined,
            contactPhone: stop.contactPhone || undefined,
            instructions: stop.instructions || undefined,
            shipmentId: stop.shipmentId,
          })),
      });
      notify(`${created.reference} saved as ${status === 'PLANNED' ? 'planned' : 'draft'}.`);
      navigate(`/admin/routes/${created.id}`);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to save route'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading route planner…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/routes">
          Back to routes
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Phase 7
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">
          {editing ? `Edit ${route?.reference ?? 'route'}` : 'Create route'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Select shipments, confirm stops, then assign an available vehicle and driver before saving.
        </p>
      </div>

      {!editing ? (
        <ol className="grid gap-2 sm:grid-cols-6">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={`rounded-md px-3 py-2 text-center text-xs font-medium ${
                index === step ? 'bg-[#12355b] text-white' : 'bg-white text-slate-600'
              }`}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
      ) : null}

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {locked ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This route is dispatched. Structural changes are locked.
        </p>
      ) : null}
      {warning ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>
      ) : null}

      {!editing && step === 0 ? (
        <ShipmentPicker
          board={board}
          selectedIds={selectedIds}
          onToggle={toggleShipment}
        />
      ) : null}

      {(!editing && step === 1) || editing ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Pickup and delivery</h2>
          {(editing ? route?.shipments.map((item) => item.reference) : selectedShipments.map((item) => item.reference))
            .length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Select at least one shipment.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(editing ? [] : selectedShipments).map((shipment) => (
                <article key={shipment.id} className="rounded-lg border border-slate-100 p-4">
                  <p className="font-medium text-slate-900">{shipment.reference}</p>
                  <p className="text-sm text-slate-500">{shipment.customerName}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Pickup: {shipment.pickup.address?.formattedAddress ?? shipment.origin?.formattedAddress ?? '—'}
                  </p>
                  <p className="text-sm text-slate-700">
                    Delivery:{' '}
                    {shipment.delivery.address?.formattedAddress ??
                      shipment.destination?.formattedAddress ??
                      '—'}
                  </p>
                </article>
              ))}
              {editing
                ? route?.shipments.map((shipment) => (
                    <article key={shipment.id} className="rounded-lg border border-slate-100 p-4">
                      <p className="font-medium text-slate-900">{shipment.reference}</p>
                      <p className="text-sm text-slate-500">{shipment.customerName}</p>
                    </article>
                  ))
                : null}
            </div>
          )}
        </section>
      ) : null}

      {(!editing && step === 2) || editing ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#12355b]">Stops</h2>
            {!locked && !editing ? (
              <button
                type="button"
                className="text-sm text-teal-800 hover:underline"
                onClick={() => setStops((current) => [...current, emptyStop()])}
              >
                Add stop
              </button>
            ) : null}
          </div>
          <ol className="mt-4 space-y-3">
            {stops.map((stop, index) => (
              <li key={stop.key} className="grid gap-2 rounded-lg border border-slate-100 p-3 md:grid-cols-6">
                <select
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  value={stop.stopType}
                  disabled={locked || editing}
                  onChange={(event) =>
                    setStops((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, stopType: event.target.value as RouteStopType }
                          : item,
                      ),
                    )
                  }
                >
                  {stopTypeOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm md:col-span-2"
                  placeholder="Address"
                  value={stop.formattedAddress}
                  disabled={locked || editing}
                  onChange={(event) =>
                    setStops((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, formattedAddress: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <input
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  placeholder="Contact"
                  value={stop.contactName}
                  disabled={locked || editing}
                  onChange={(event) =>
                    setStops((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, contactName: event.target.value } : item,
                      ),
                    )
                  }
                />
                <input
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  placeholder="Phone"
                  value={stop.contactPhone}
                  disabled={locked || editing}
                  onChange={(event) =>
                    setStops((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, contactPhone: event.target.value } : item,
                      ),
                    )
                  }
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="rounded-md border px-2 text-sm disabled:opacity-40"
                    disabled={locked || editing || index === 0}
                    onClick={() => moveStop(index, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="rounded-md border px-2 text-sm disabled:opacity-40"
                    disabled={locked || editing || index === stops.length - 1}
                    onClick={() => moveStop(index, 1)}
                  >
                    Down
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {editing ? (
            <p className="mt-3 text-sm text-slate-500">
              Use the route details page to add, remove, or reorder stops before dispatch.
            </p>
          ) : null}
        </section>
      ) : null}

      {(!editing && (step === 3 || step === 5)) || editing ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Vehicle</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {vehicleChoices.map((vehicle) => {
              const capacity = weightToKg(vehicle.payloadCapacity, vehicle.payloadUnit);
              const over = capacity != null && cargoWeightKg > capacity;
              return (
                <label
                  key={vehicle.id}
                  className={`cursor-pointer rounded-lg border p-3 text-sm ${
                    vehicleId === vehicle.id ? 'border-[#12355b] bg-slate-50' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    className="mr-2"
                    name="vehicle"
                    checked={vehicleId === vehicle.id}
                    disabled={locked}
                    onChange={() => setVehicleId(vehicle.id)}
                  />
                  {vehicle.registrationNumber} · {vehicle.vehicleTypeName}
                  <span className="mt-1 block text-xs text-slate-500">
                    {vehicle.status.replaceAll('_', ' ')} · capacity {formatKg(capacity)}
                    {over ? ' · over cargo weight' : ''}
                  </span>
                </label>
              );
            })}
          </div>
          {!vehicleChoices.length ? (
            <p className="mt-3 text-sm text-slate-500">No available vehicles in this organization.</p>
          ) : null}
        </section>
      ) : null}

      {(!editing && (step === 4 || step === 5)) || editing ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Driver</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {driverChoices.map((driver) => (
              <label
                key={driver.id}
                className={`cursor-pointer rounded-lg border p-3 text-sm ${
                  driverId === driver.id ? 'border-[#12355b] bg-slate-50' : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  className="mr-2"
                  name="driver"
                  checked={driverId === driver.id}
                  disabled={locked}
                  onChange={() => setDriverId(driver.id)}
                />
                {driver.firstName} {driver.lastName}
                <span className="mt-1 block text-xs text-slate-500">
                  {driver.status.replaceAll('_', ' ')} · {driver.phoneE164}
                </span>
              </label>
            ))}
          </div>
          {!driverChoices.length ? (
            <p className="mt-3 text-sm text-slate-500">No available drivers in this organization.</p>
          ) : null}
        </section>
      ) : null}

      {(!editing && step === 5) || editing ? (
        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium text-slate-700">Route type</span>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={routeType}
              onChange={(event) => setRouteType(event.target.value as RouteType)}
            >
              {routeTypeOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Notes</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Planned departure</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={plannedDepartureAt}
              onChange={(event) => setPlannedDepartureAt(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Planned arrival</span>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={plannedArrivalAt}
              onChange={(event) => setPlannedArrivalAt(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Distance (km)</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={distanceKm}
              onChange={(event) => setDistanceKm(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-700">Estimated duration (minutes)</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
          </label>
          <div className="md:col-span-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <p>Cargo: {formatKg(cargoWeightKg)}</p>
            <p>Vehicle: {selectedVehicle?.registrationNumber ?? route?.vehicleRegistration ?? 'None'}</p>
            <p>
              Driver:{' '}
              {selectedDriver
                ? `${selectedDriver.firstName} ${selectedDriver.lastName}`
                : (route?.driverName ?? 'None')}
            </p>
            <p>Planned departure: {plannedDepartureAt ? formatDate(toIsoDateTime(plannedDepartureAt) ?? null) : '—'}</p>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        {!editing ? (
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm disabled:opacity-40"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          {!editing && step < STEPS.length - 1 ? (
            <button
              type="button"
              className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={step === 0 && selectedIds.length === 0}
              onClick={() => setStep((current) => current + 1)}
            >
              Continue
            </button>
          ) : null}
          {editing || step === STEPS.length - 1 ? (
            <>
              {!editing ? (
                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-sm disabled:opacity-40"
                  disabled={saving || selectedIds.length === 0}
                  onClick={() => void save('DRAFT')}
                >
                  Save draft
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white disabled:opacity-40"
                disabled={saving || (!editing && selectedIds.length === 0) || locked}
                onClick={() => void save(editing ? undefined : 'PLANNED')}
              >
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Save as planned'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function stopsFromShipments(shipments: ShipmentPayload[]): StopDraft[] {
  return shipments.flatMap((shipment) => [
    {
      key: `${shipment.id}-pickup`,
      stopType: 'PICKUP' as const,
      formattedAddress:
        shipment.pickup.address?.formattedAddress ?? shipment.origin?.formattedAddress ?? 'Pickup',
      contactName: shipment.pickup.contactName ?? '',
      contactPhone: shipment.pickup.phoneE164 ?? '',
      instructions: shipment.pickup.instructions ?? '',
      shipmentId: shipment.id,
    },
    {
      key: `${shipment.id}-delivery`,
      stopType: 'DELIVERY' as const,
      formattedAddress:
        shipment.delivery.address?.formattedAddress ??
        shipment.destination?.formattedAddress ??
        'Delivery',
      contactName: shipment.delivery.contactName ?? '',
      contactPhone: shipment.delivery.phoneE164 ?? '',
      instructions: shipment.delivery.instructions ?? '',
      shipmentId: shipment.id,
    },
  ]);
}

function ShipmentPicker({
  board,
  selectedIds,
  onToggle,
}: {
  board: DispatchBoardPayload | null;
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShipmentPayload[]>([]);

  async function search() {
    const params = new URLSearchParams({ pageSize: '20', sort: 'createdAt', order: 'desc' });
    if (query.trim()) params.set('q', query.trim());
    const page = await apiGetWithMeta<ShipmentPayload[]>(`/shipments?${params.toString()}`);
    setResults(page.data);
  }

  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unassigned = board?.unassignedShipments ?? [];

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Unassigned shipments</h2>
        {unassigned.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No ready shipments waiting for a route.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {unassigned.map((shipment) => (
              <li key={shipment.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(shipment.id)}
                    onChange={() => onToggle(shipment.id)}
                  />
                  <span>
                    <span className="font-medium text-slate-900">{shipment.reference}</span>
                    <span className="block text-slate-500">
                      {shipment.customerName} · {shipment.origin ?? '—'} → {shipment.destination ?? '—'}
                    </span>
                  </span>
                  <StatusBadge status={shipment.status} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </article>
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-[#12355b]">Search shipments</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Reference or customer"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="rounded-md bg-[#12355b] px-3 py-2 text-sm text-white">
            Search
          </button>
        </form>
        <ul className="mt-3 space-y-2">
          {results.map((shipment) => (
            <li key={shipment.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(shipment.id)}
                  onChange={() => onToggle(shipment.id)}
                />
                <span className="font-medium">{shipment.reference}</span>
                <span className="text-slate-500">{shipment.customerName}</span>
              </label>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
