import type { DriverPayload, DriverStatus } from '@mizigox/shared';
import {
  DRIVER_TRANSITIONS,
  canCreateDriverDocuments,
  canDeleteDriverDocuments,
  canDeleteDrivers,
  canUpdateDriverDocuments,
  canUpdateDriverStatus,
  canUpdateDrivers,
  fleetStatusLabel,
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
  driverDocumentTypeOptions,
  formatApiError,
  formatDate,
  formatDateTime,
} from '../fleet/form-utils';

type Tab = 'overview' | 'license' | 'documents' | 'vehicle' | 'activity';
type ConfirmState = { type: 'status'; status: DriverStatus } | { type: 'archive' } | null;

interface ActivityEvent {
  action: string;
  entityType: string;
  actorName: string | null;
  createdAt: string;
}

export function DriverDetailPage() {
  const { driverId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const canEdit = canUpdateDrivers(user?.permissions);
  const canStatus = canUpdateDriverStatus(user?.permissions);
  const canArchive = canDeleteDrivers(user?.permissions);
  const [tab, setTab] = useState<Tab>(
    location.pathname.endsWith('/documents') ? 'documents' : 'overview',
  );
  const [driver, setDriver] = useState<DriverPayload | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusNote, setStatusNote] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!driverId || !UUID_PATTERN.test(driverId)) {
      setError('Driver not found');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [record, history] = await Promise.all([
        apiGet<DriverPayload>(`/drivers/${driverId}`),
        apiGet<{ events: ActivityEvent[] }>(`/drivers/${driverId}/activity`).catch(() => ({
          events: [],
        })),
      ]);
      setDriver(record);
      setActivity(history.events);
      setError(null);
    } catch (cause) {
      setError(formatApiError(cause, 'Unable to load driver'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

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

  const transitions = driver ? DRIVER_TRANSITIONS[driver.status] : [];

  function selectTab(next: Tab) {
    setTab(next);
    if (!driver) {
      return;
    }
    const documentsPath = `/admin/drivers/${driver.id}/documents`;
    const detailPath = `/admin/drivers/${driver.id}`;
    if (next === 'documents' && location.pathname !== documentsPath) {
      navigate(documentsPath);
    } else if (next !== 'documents' && location.pathname === documentsPath) {
      navigate(detailPath);
    }
  }

  async function runConfirmed() {
    if (!driver || !confirm) {
      return;
    }
    setBusy(true);
    try {
      if (confirm.type === 'status') {
        const updated = await apiPost<DriverPayload>(`/drivers/${driver.id}/status`, {
          status: confirm.status,
          note: statusNote || undefined,
        });
        setDriver(updated);
        setStatusNote('');
        notify(`${updated.reference} is now ${fleetStatusLabel(updated.status).toLowerCase()}.`);
        const history = await apiGet<{ events: ActivityEvent[] }>(`/drivers/${driver.id}/activity`);
        setActivity(history.events);
      } else {
        await apiDelete(`/drivers/${driver.id}`);
        notify(`${driver.reference} was archived.`);
        navigate('/admin/drivers');
      }
    } catch (cause) {
      notify(formatApiError(cause, 'Unable to complete that action'), 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading driver…</p>;
  }
  if (error || !driver) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? 'Driver not found'}
        </p>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/drivers">
          Back to drivers
        </Link>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'license', label: 'License' },
    { id: 'documents', label: 'Documents' },
    { id: 'vehicle', label: 'Vehicle' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link className="text-sm text-teal-800 hover:underline" to="/admin/drivers">
            Back to drivers
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-[#12355b]">
              {driver.firstName} {driver.lastName}
            </h1>
            <StatusBadge status={driver.status} />
            <StatusBadge status={driver.availability} />
            <DocumentAlertBadge alert={driver.documentAlert} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {driver.reference} · {driver.organizationName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Link
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm font-medium text-white"
              to={`/admin/drivers/${driver.id}/edit`}
            >
              Edit driver
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
            <OverviewCard label="Reference" value={driver.reference} />
            <OverviewCard label="Phone" value={driver.phoneE164} />
            <OverviewCard label="Status" value={fleetStatusLabel(driver.status)} />
            <OverviewCard label="Availability" value={fleetStatusLabel(driver.availability)} />
          </div>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#12355b]">Contact and profile</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Item label="Email" value={driver.email} />
              <Item label="Linked user" value={driver.userEmail} />
              <Item label="Date of birth" value={formatDate(driver.dateOfBirth)} />
              <Item label="Nationality" value={driver.nationalityCountryCode} />
              <Item label="Emergency contact" value={driver.emergencyContactName} />
              <Item label="Emergency phone" value={driver.emergencyContactPhone} />
              <Item label="Created by" value={driver.createdByName} />
              <Item label="Created" value={formatDate(driver.createdAt)} />
              <Item label="Updated" value={formatDate(driver.updatedAt)} />
            </dl>
            {driver.notes ? <p className="mt-4 text-sm text-slate-600">{driver.notes}</p> : null}
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

      {tab === 'license' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#12355b]">License</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Item label="License number" value={driver.licenseNumber} />
            <Item label="Category / class" value={driver.licenseCategory} />
            <Item label="Issue date" value={formatDate(driver.licenseIssuedAt)} />
            <Item label="Expiry date" value={formatDate(driver.licenseExpiresAt)} />
          </dl>
        </section>
      ) : null}

      {tab === 'documents' ? (
        <DocumentsPanel
          ownerLabel="Driver"
          documents={driver.documents}
          createPath={`/drivers/${driver.id}/documents`}
          itemPath={(documentId) => `/drivers/${driver.id}/documents/${documentId}`}
          typeOptions={driverDocumentTypeOptions}
          canCreate={canCreateDriverDocuments(user?.permissions)}
          canUpdate={canUpdateDriverDocuments(user?.permissions)}
          canDelete={canDeleteDriverDocuments(user?.permissions)}
          onChanged={load}
        />
      ) : null}

      {tab === 'vehicle' ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#12355b]">Current vehicle</h2>
            <p className="mt-2 text-sm text-slate-500">
              Vehicle assignment will connect Shipment → Route → Vehicle → Driver in Phase 7. This
              driver is not assigned to a vehicle.
            </p>
          </article>
          <article className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#12355b]">Vehicle assignment history</h2>
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

      {confirm ? (
        <ConfirmDialog
          title={
            confirm.type === 'archive'
              ? `Archive ${driver.reference}?`
              : `Update ${driver.reference} status?`
          }
          message={
            confirm.type === 'archive'
              ? 'Only inactive or suspended drivers can be archived. Archived drivers leave the active list.'
              : `Move this driver from ${fleetStatusLabel(driver.status)} to ${fleetStatusLabel(confirm.status)}? Availability will update automatically.`
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
