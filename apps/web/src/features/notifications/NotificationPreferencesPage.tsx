import type { NotificationCategory, NotificationPreferencePayload } from '@mizigox/shared';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  notificationCategoryLabel,
} from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { ApiError, apiGet, apiPatch } from '../../shared/api/client';

export function NotificationPreferencesPage() {
  const [items, setItems] = useState<NotificationPreferencePayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await apiGet<NotificationPreferencePayload[]>('/notifications/preferences');
        if (!cancelled) {
          setItems(result);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof ApiError ? cause.message : 'Unable to load preferences');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function enabled(category: NotificationCategory, channel: string) {
    return (
      items.find((item) => item.category === category && item.channel === channel)?.enabled ?? false
    );
  }

  function mandatory(category: NotificationCategory, channel: string) {
    return (
      items.find((item) => item.category === category && item.channel === channel)?.mandatory ??
      false
    );
  }

  function toggle(
    category: NotificationCategory,
    channel: NotificationPreferencePayload['channel'],
  ) {
    setItems((current) =>
      current.map((item) =>
        item.category === category && item.channel === channel
          ? { ...item, enabled: item.mandatory ? true : !item.enabled }
          : item,
      ),
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await apiPatch<NotificationPreferencePayload[]>('/notifications/preferences', {
        preferences: items.map((item) => ({
          category: item.category,
          channel: item.channel,
          enabled: item.enabled,
          digest: item.digest,
        })),
      });
      setItems(result);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to save preferences');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[#12355b]">Notification preferences</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose how MizigoX contacts you. Account and security alerts stay on.
        </p>
      </div>
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {saved ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Preferences saved.
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-slate-500">Loading preferences…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Category</th>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <th key={channel} className="px-4 py-3">
                    {channel.replaceAll('_', ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_CATEGORIES.map((category) => (
                <tr key={category} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {notificationCategoryLabel(category)}
                  </td>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <td key={channel} className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={enabled(category, channel)}
                        disabled={mandatory(category, channel)}
                        onChange={() => toggle(category, channel)}
                        aria-label={`${notificationCategoryLabel(category)} ${channel}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white disabled:opacity-60"
        disabled={saving || loading}
        onClick={() => {
          void save();
        }}
      >
        {saving ? 'Saving…' : 'Save preferences'}
      </button>
    </section>
  );
}
