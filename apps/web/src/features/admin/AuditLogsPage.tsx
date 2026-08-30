import type { AuditLogPayload } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { apiGetWithMeta } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ResponsiveTable,
} from '../../shared/ui/Dashboard';

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogPayload[]>([]);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: '1', pageSize: '25' });
    if (query.trim()) params.set('q', query.trim());
    if (action.trim()) params.set('action', action.trim());
    try {
      const result = await apiGetWithMeta<AuditLogPayload[]>(`/admin/audit?${params.toString()}`);
      setLogs(result.data);
      setError(null);
    } catch (cause) {
      setError(formatAppError(cause, 'Unable to load audit logs'));
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
        title="Audit logs"
        description="Important account and operational activity for your organization."
      />
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search action or actor"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search audit logs"
        />
        <input
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Action"
          value={action}
          onChange={(event) => setAction(event.target.value)}
          aria-label="Filter by action"
        />
        <button type="submit" className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white">
          Filter
        </button>
      </form>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : logs.length === 0 ? (
        <EmptyState title="No audit records match this filter." />
      ) : (
        <ResponsiveTable>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{log.actorName ?? log.actorEmail ?? 'System'}</td>
                  <td className="px-3 py-2">{log.action}</td>
                  <td className="px-3 py-2">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
