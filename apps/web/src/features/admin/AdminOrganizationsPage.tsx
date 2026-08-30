import type { AdminUserPayload, OrganizationSettingsPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';

interface OrganizationOption {
  id: string;
  name: string;
  type: string;
  status?: string;
}

export function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setOrgs(await apiGet<OrganizationOption[]>('/organizations'));
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load organizations'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (orgs.length === 0) return <EmptyState title="No organizations found." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Organizations" description="Tenant organizations visible to your account." />
      <ul className="space-y-2">
        {orgs.map((org) => (
          <li key={org.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <Link className="font-medium text-[#12355b] hover:underline" to={`/admin/organizations/${org.id}`}>
              {org.name}
            </Link>
            <p className="text-sm text-slate-500">{org.type}</p>
            {org.status ? <StatusBadge status={org.status} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminOrganizationDetailPage() {
  const { organizationId } = useParams();
  const [org, setOrg] = useState<OrganizationSettingsPayload | null>(null);
  const [users, setUsers] = useState<AdminUserPayload[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    void Promise.all([
      apiGet<OrganizationSettingsPayload>(`/organizations/${organizationId}`),
      apiGet<AdminUserPayload[]>(`/organizations/${organizationId}/users`).catch(() => []),
    ])
      .then(([nextOrg, nextUsers]) => {
        setOrg(nextOrg);
        setUsers(nextUsers);
      })
      .catch((cause) => setError(formatAppError(cause, 'Unable to load organization')));
  }, [organizationId]);

  if (error) return <ErrorState message={error} />;
  if (!org) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title={org.name} description={org.legalName ?? org.type} />
      <StatusBadge status={org.status} />
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p>Country: {org.countryCode}</p>
        <p>Currency: {org.defaultCurrencyCode}</p>
        <p>Email: {org.email ?? '—'}</p>
        <p>Phone: {org.phoneE164 ?? '—'}</p>
        <p>Timezone: {org.timezone}</p>
        <Link className="mt-3 inline-block text-[#12355b] hover:underline" to="/admin/settings">
          Organization settings
        </Link>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Organization users</h2>
        {users.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No users found for this organization.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {users.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link className="font-medium text-[#12355b] hover:underline" to={`/admin/users/${item.id}`}>
                  {item.firstName} {item.lastName}
                </Link>
                <span className="text-slate-500">{item.role.replaceAll('_', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
