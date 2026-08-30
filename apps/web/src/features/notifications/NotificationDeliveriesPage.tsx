import type { NotificationDeliveryPayload } from '@mizigox/shared';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DELIVERY_STATUSES,
  canRetryNotifications,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { ApiError, apiGetWithMeta, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { formatWhen } from './format';

export function NotificationDeliveriesPage() {
  const { user } = useAuth();
  const canRetry = canRetryNotifications(user?.permissions);
  const [items, setItems] = useState<NotificationDeliveryPayload[]>([]);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  async function load(nextPage = page, nextStatus = status, nextChannel = channel) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
    });
    if (nextStatus) params.set('status', nextStatus);
    if (nextChannel) params.set('channel', nextChannel);
    try {
      const result = await apiGetWithMeta<NotificationDeliveryPayload[]>(
        `/notifications/deliveries?${params.toString()}`,
      );
      setItems(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load deliveries');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1, status, channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, channel]);

  async function retry(id: string) {
    try {
      await apiPost(`/notifications/deliveries/${id}/retry`);
      await load(page);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to retry delivery');
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[#12355b]">Notification deliveries</h1>
        <p className="mt-1 text-sm text-slate-500">
          Inspect queued, sent, and failed deliveries for this organization.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm">
          Status
          <select
            className="ml-2 rounded-md border border-slate-300 px-2 py-1"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All</option>
            {NOTIFICATION_DELIVERY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Channel
          <select
            className="ml-2 rounded-md border border-slate-300 px-2 py-1"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
          >
            <option value="">All</option>
            {NOTIFICATION_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-sm text-slate-500">Loading deliveries…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-500">No deliveries found.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Failure</th>
                {canRetry ? <th className="px-4 py-3" /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{item.type.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3">{item.recipientName ?? item.recipientEmail ?? '—'}</td>
                  <td className="px-4 py-3">{item.channel}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatWhen(item.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {item.sentAt ? formatWhen(item.sentAt) : '—'}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-red-700">
                    {item.lastError ?? '—'}
                  </td>
                  {canRetry ? (
                    <td className="px-4 py-3">
                      {item.status === 'FAILED' ? (
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          onClick={() => {
                            void retry(item.id);
                          }}
                        >
                          Retry
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Page {page} of {pages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
            onClick={() => {
              void load(page - 1);
            }}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= pages}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
            onClick={() => {
              void load(page + 1);
            }}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
