import type { VehiclePayload, VehicleStatus } from '@mizigox/shared';
import {
  VEHICLE_TRANSITIONS,
  canCreateVehicleDocuments,
  canDeleteVehicleDocuments,
  canDeleteVehicles,
  canUpdateVehicleDocuments,
  canUpdateVehicleStatus,
  canUpdateVehicles,
  capacityLabel,
  fleetStatusLabel,
  vehicleTypeLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';
import { DocumentAlertBadge } from '../fleet/DocumentAlertBadge';
import { DocumentsPanel } from '../fleet/DocumentsPanel';
import {
  UUID_PATTERN,
  formatApiError,
  formatDate,
  formatDateTime,
  vehicleDocumentTypeOptions,
} from '../fleet/form-utils';

type Tab = 'overview' | 'documents' | 'driver' | 'activity' | 'maintenance';
type ConfirmState = { type: 'status'; status: VehicleStatus } | { type: 'archive' } | null;

interface ActivityEvent {
  action: string;
  entityType: string;
  actorName: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export function VehicleDetailPage() {
  const { vehicleId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canEdit = canUpdateVehicles(user?.permissions);
  const canStatus = canUpdateVehicleStatus(user?.permissions);
  const canArchive = canDeleteVehicles(user?.permissions);
  const [tab, setTab] = useState<Tab>(
    location.pathname.endsWith('/documents') ? 'documents' : 'overview',
  );
  const [vehicle, setVehicle] = useState<VehiclePayload | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusNote, setStatusNote] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!vehicleId || !UUID_PATTERN.test(vehicleId)) {
      setError('Vehicle not found');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [record, history] = await Promise.all([
        apiGet<VehiclePayload>(`/vehicles/${vehicleId}`),
        apiGet<{ events: ActivityEvent[] }>(`/vehicles/${vehicleId}/activity`).catch(() => ({
          events: [],
        })),
      ]);
      setVehicle(record);
      setActivity(history.events);
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load vehicle'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  useEffect(() => {
    setTab(
      location.pathname.endsWith('/documents')
        ? 'documents'
        : tab === 'documents'
          ? 'overview'
          : tab,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const transitions = vehicle ? VEHICLE_TRANSITIONS[vehicle.status] : [];

  function selectTab(next: Tab) {
    setTab(next);
    if (!vehicle) {
      return;
    }
    const documentsPath = `/admin/vehicles/${vehicle.id}/documents`;
    const detailPath = `/admin/vehicles/${vehicle.id}`;
    if (next === 'documents' && location.pathname !== documentsPath) {
      navigate(documentsPath);
    } else if (next !== 'documents' && location.pathname === documentsPath) {
      navigate(detailPath);
    }
  }

  async function runConfirmed() {
    if (!vehicle || !confirm) {
      return;
    }
    setBusy(true);
    try {
      if (confirm.type === 'status') {
        const updated = await apiPost<VehiclePayload>(`/vehicles/${vehicle.id}/status`, {
          status: confirm.status,
          note: statusNote || undefined,
        });
        setVehicle(updated);
        setStatusNote('');
        notify(`${updated.reference} is now ${fleetStatusLabel(updated.status).toLowerCase()}.`);
        const history = await apiGet<{ events: ActivityEvent[] }>(
          `/vehicles/${vehicle.id}/activity`,
        );
        setActivity(history.events);
      } else {
        await apiDelete(`/vehicles/${vehicle.id}`);
        notify(`${vehicle.reference} was archived.`);
        navigate('/admin/vehicles');
      }
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to complete that action'), 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading vehicle…</p>;
  }
  if (error || !vehicle) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? 'Vehicle not found'}
        </p>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/vehicles">
          Back to vehicles
        </Link>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents' },
    { id: 'driver', label: 'Driver' },
    { id: 'activity', label: 'Activity' },
    { id: 'maintenance', label: 'Maintenance' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link className="text-sm text-teal-800 hover:underline" to="/admin/vehicles">
            Back to vehicles
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-[#12355b]">{vehicle.reference}</h1>
            <StatusBadge status={vehicle.status} />
            <StatusBadge status={vehicle.availability} />
            <DocumentAlertBadge alert={vehicle.documentAlert} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {vehicle.registrationNumber} ·{' '}
            {vehicle.vehicleTypeName || vehicleTypeLabel(vehicle.vehicleType)} ·{' '}
            {vehicle.organizationName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && vehicle.status !== 'RETIRED' ? (
            <Link
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm font-medium text-white"
              to={`/admin/vehicles/${vehicle.id}/edit`}
            >
              Edit vehicle
            </Link>
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

      <nav className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === item.id ? 'bg-[#12355b] text-white' : 'border border-slate-300 text-slate-700'
            }`}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OverviewCard label="Registration" value={vehicle.registrationNumber} />
            <OverviewCard
              label="Capacity"
              value={capacityLabel(vehicle.payloadCapacity, vehicle.payloadUnit)}
            />
            <OverviewCard label="Status" value={fleetStatusLabel(vehicle.status)} />
            <OverviewCard label="Availability" value={fleetStatusLabel(vehicle.availability)} />
          </div>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#12355b]">Vehicle information</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Item
                label="Make / model"
                value={[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
              />
              <Item label="Year" value={vehicle.year != null ? String(vehicle.year) : null} />
              <Item label="Color" value={vehicle.color} />
              <Item label="VIN / chassis" value={vehicle.vin} />
              <Item label="Engine number" value={vehicle.engineNumber} />
              <Item
                label="Fuel"
                value={vehicle.fuelType ? fleetStatusLabel(vehicle.fuelType) : null}
              />
              <Item label="Ownership" value={fleetStatusLabel(vehicle.ownershipType)} />
              <Item
                label="Dimensions"
                value={
                  vehicle.lengthM != null || vehicle.widthM != null || vehicle.heightM != null
                    ? `${vehicle.lengthM ?? '—'} × ${vehicle.widthM ?? '—'} × ${vehicle.heightM ?? '—'} m`
                    : null
                }
              />
              <Item label="Created by" value={vehicle.createdByName} />
              <Item label="Created" value={formatDate(vehicle.createdAt)} />
              <Item label="Updated" value={formatDate(vehicle.updatedAt)} />
            </dl>
            {vehicle.notes ? <p className="mt-4 text-sm text-slate-600">{vehicle.notes}</p> : null}
            {canStatus && transitions.length > 0 ? (
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <label className="block text-sm font-medium">
                  Status note
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={statusNote}
                    onChange={(event) => setStatusNote(event.target.value)}
                    placeholder="Optional note for the audit trail"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {transitions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => setConfirm({ type: 'status', status })}
                    >
                      Mark {fleetStatusLabel(status).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        </section>
      ) : null}

      {tab === 'documents' ? (
        <DocumentsPanel
          ownerLabel="Vehicle"
          documents={vehicle.documents}
          createPath={`/vehicles/${vehicle.id}/documents`}
          itemPath={(documentId) => `/vehicles/${vehicle.id}/documents/${documentId}`}
          typeOptions={vehicleDocumentTypeOptions}
          canCreate={canCreateVehicleDocuments(user?.permissions)}
          canUpdate={canUpdateVehicleDocuments(user?.permissions)}
          canDelete={canDeleteVehicleDocuments(user?.permissions)}
          onChanged={load}
        />
      ) : null}

      {tab === 'driver' ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#12355b]">Current assigned driver</h2>
            <p className="mt-2 text-sm text-slate-500">
              Driver assignment will connect Shipment → Route → Vehicle → Driver in Phase 7. This
              vehicle is not assigned.
            </p>
          </article>
          <article className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#12355b]">Driver history</h2>
            <p className="mt-2 text-sm text-slate-500">
              Assignment history will appear here after dispatch is implemented. No placeholder
              assignments are recorded.
            </p>
          </article>
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Activity</h2>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No activity recorded yet.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {activity.map((event, index) => (
                <li key={`${event.createdAt}-${index}`} className="border-l-2 border-teal-200 pl-3">
                  <p className="text-sm font-medium text-slate-900">
                    {event.action.replaceAll('_', ' ')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(event.createdAt)}
                    {event.actorName ? ` · ${event.actorName}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {tab === 'maintenance' ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">Maintenance</h2>
          <p className="mt-2 text-sm text-slate-500">
            Workshop jobs, service intervals, and parts history will be managed in a later
            maintenance module. Vehicles can already be moved to the Maintenance status.
          </p>
        </section>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={
            confirm.type === 'archive'
              ? `Archive ${vehicle.reference}?`
              : `Update ${vehicle.reference} status?`
          }
          message={
            confirm.type === 'archive'
              ? 'Only inactive or retired vehicles can be archived. Archived vehicles leave the active fleet list.'
              : `Move this vehicle from ${fleetStatusLabel(vehicle.status)} to ${fleetStatusLabel(confirm.status)}? Availability will update automatically.`
          }
          confirmLabel={confirm.type === 'archive' ? 'Archive' : 'Update status'}
          danger={confirm.type === 'archive'}
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
