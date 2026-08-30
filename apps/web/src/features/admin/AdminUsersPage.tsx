import type { AdminUserPayload } from '@mizigox/shared';
import { canManageUsers } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InviteUserPanel } from '../auth/InviteUserPanel';
import { apiGetWithMeta } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthProvider';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ResponsiveTable,
} from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';

export function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserPayload[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: '1', pageSize: '20' });
    if (query.trim()) params.set('q', query.trim());
    if (status) params.set('status', status);
    try {
      const result = await apiGetWithMeta<AdminUserPayload[]>(`/admin/users?${params.toString()}`);
      setUsers(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load users'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Organization members. Role changes cannot be used to elevate your own account."
      />
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label className="sr-only" htmlFor="user-search">
          Search users
        </label>
        <input
          id="user-search"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search name or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DISABLED">Disabled</option>
        </select>
        <button type="submit" className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white">
          Search
        </button>
      </form>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : users.length === 0 ? (
        <EmptyState title="No users found." />
      ) : (
        <ResponsiveTable>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link
                      className="font-medium text-[#12355b] hover:underline"
                      to={`/admin/users/${item.id}`}
                    >
                      {item.firstName} {item.lastName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{item.email}</td>
                  <td className="px-3 py-2">{item.role.replaceAll('_', ' ')}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
      <p className="text-xs text-slate-500">{total} users</p>
      {canManageUsers(user?.permissions) ? <InviteUserPanel /> : null}
    </div>
  );
}
