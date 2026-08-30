import type { NotificationPayload, NotificationType } from '@mizigox/shared';
import { NOTIFICATION_TYPES, notificationTypeLabel } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiGetWithMeta, apiPost } from '../../shared/api/client';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { formatWhen } from './format';

export function NotificationsPage({
  basePath,
  preferencesPath,
}: {
  basePath: string;
  preferencesPath: string;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationPayload[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<NotificationType | ''>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 15;

  async function load(nextPage = page, nextUnread = unreadOnly, nextType = type) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
    });
    if (nextUnread) params.set('unread', 'true');
    if (nextType) params.set('type', nextType);
    try {
      const result = await apiGetWithMeta<NotificationPayload[]>(
        `/notifications?${params.toString()}`,
      );
      setItems(result.data);
      setTotal(result.meta.total ?? result.data.length);
      setPage(result.meta.page ?? nextPage);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load notifications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1, unreadOnly, type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly, type]);

  async function toggleRead(item: NotificationPayload) {
    try {
      if (item.readAt) {
        await apiPost(`/notifications/${item.id}/unread`);
      } else {
        await apiPost(`/notifications/${item.id}/read`);
      }
      await load(page);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to update notification');
    }
  }

  async function markAll() {
    try {
      await apiPost('/notifications/read-all');
      await load(page);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to mark all as read');
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#12355b]">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">In-app history for your MizigoX account.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={preferencesPath}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Preferences
          </Link>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => {
              void markAll();
            }}
          >
            Mark all as read
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm text-slate-700">
          Type
          <select
            className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={type}
            onChange={(event) => setType(event.target.value as NotificationType | '')}
          >
            <option value="">All</option>
            {NOTIFICATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {notificationTypeLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />
          Unread only
        </label>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-sm text-slate-500">Loading notifications…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-500">No notifications match these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className={item.readAt ? 'bg-white' : 'bg-sky-50/50'}>
                <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => navigate(item.linkPath || basePath)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-800">{item.title}</p>
                      <StatusBadge status={item.priority} />
                      {item.readAt ? null : <StatusBadge status="UNREAD" />}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatWhen(item.createdAt)}
                      {item.relatedReference ? ` · ${item.relatedReference}` : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    onClick={() => {
                      void toggleRead(item);
                    }}
                  >
                    {item.readAt ? 'Mark unread' : 'Mark read'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          Page {page} of {pages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => {
              void load(page - 1);
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50"
            disabled={page >= pages}
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
