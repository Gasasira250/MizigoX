import type { NotificationPayload, UnreadCountPayload } from '@mizigox/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiGet, apiGetWithMeta, apiPost } from '../../shared/api/client';
import { formatWhen } from './format';

export function NotificationBell({ historyPath }: { historyPath: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationPayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  async function refreshCount() {
    try {
      const result = await apiGet<UnreadCountPayload>('/notifications/unread-count');
      setUnread(result.unreadCount);
    } catch {
      /* keep last known count */
    }
  }

  async function loadRecent() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGetWithMeta<NotificationPayload[]>(
        '/notifications?page=1&pageSize=8',
      );
      setItems(result.data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load notifications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshCount();
    const timer = window.setInterval(() => {
      void refreshCount();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function openNotification(item: NotificationPayload) {
    if (!item.readAt) {
      try {
        await apiPost(`/notifications/${item.id}/read`);
        setUnread((count) => Math.max(0, count - 1));
        setItems((current) =>
          current.map((row) =>
            row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row,
          ),
        );
      } catch {
        /* navigation still proceeds */
      }
    }
    setOpen(false);
    navigate(item.linkPath || historyPath);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        aria-label="Notifications"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            void loadRecent();
            void refreshCount();
          }
        }}
      >
        Notifications
        {unread > 0 ? (
          <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-[#12355b]">Notifications</p>
            <Link
              to={historyPath}
              className="text-xs text-slate-500 hover:underline"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-500">Loading notifications…</p>
          ) : error ? (
            <p className="px-4 py-6 text-sm text-red-700">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${item.readAt ? '' : 'bg-sky-50/60'}`}
                    onClick={() => {
                      void openNotification(item);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatWhen(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.message}</p>
                    {item.relatedReference ? (
                      <p className="mt-1 text-[11px] text-slate-500">{item.relatedReference}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
