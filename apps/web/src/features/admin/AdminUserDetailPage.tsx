import type { AdminUserPayload, RoleOption } from '@mizigox/shared';
import { ROLE_CODES, canManageUsers } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPatch } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthProvider';
import { ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';

export function AdminUserDetailPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const canManage = canManageUsers(user?.permissions);
  const [record, setRecord] = useState<AdminUserPayload | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState('');

  async function load() {
    if (!userId) return;
    try {
      const next = await apiGet<AdminUserPayload>(`/admin/users/${userId}`);
      setRecord(next);
      setRole(next.role);
      setError(null);
      if (canManage) {
        setRoles(await apiGet<RoleOption[]>('/roles'));
      }
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load user'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (error && !record) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!record) return <LoadingState />;

  const isSelf = record.id === user?.id;

  return (
    <div className="space-y-6">
      <PageHeader title={`${record.firstName} ${record.lastName}`} description={record.email} />
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p>Organization: {record.organizationName}</p>
        <p className="mt-1">Role: {record.role.replaceAll('_', ' ')}</p>
        <div className="mt-2">
          <StatusBadge status={record.status} />
        </div>
      </section>
      {canManage && !isSelf ? (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Account status</h2>
          <div className="flex flex-wrap gap-2">
            {(['ACTIVE', 'SUSPENDED', 'DISABLED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                onClick={() => {
                  void apiPatch<AdminUserPayload>(`/admin/users/${record.id}`, { status })
                    .then(setRecord)
                    .then(() => notify('User status updated'))
                    .catch((cause) =>
                      notify(formatAppError(cause, 'Unable to update user'), 'error'),
                    );
                }}
              >
                {status}
              </button>
            ))}
          </div>
          <label className="block text-sm font-medium">
            Assign role
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {(roles.length ? roles.map((item) => item.code) : ROLE_CODES).map((code) => (
                <option key={code} value={code}>
                  {code.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white"
            onClick={() => {
              void apiPatch<AdminUserPayload>(`/admin/users/${record.id}/role`, { role })
                .then(setRecord)
                .then(() => notify('Role updated'))
                .catch((cause) => notify(formatAppError(cause, 'Unable to assign role'), 'error'));
            }}
          >
            Save role
          </button>
        </section>
      ) : null}
    </div>
  );
}
