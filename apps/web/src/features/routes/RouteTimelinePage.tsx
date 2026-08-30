import type { RoutePayload } from '@mizigox/shared';
import { canViewRouteHistory, routeStatusLabel } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { formatApiError, formatDate } from './form-utils';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function RouteTimelinePage() {
  const { routeId } = useParams();
  const { user } = useAuth();
  const canHistory = canViewRouteHistory(user?.permissions);
  const [route, setRoute] = useState<RoutePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!routeId || !UUID_PATTERN.test(routeId)) {
      setError('Route not found');
      setLoading(false);
      return;
    }
    apiGet<RoutePayload>(`/routes/${routeId}`)
      .then(setRoute)
      .catch((cause) => setError(formatApiError(cause, 'Unable to load route timeline')))
      .finally(() => setLoading(false));
  }, [routeId]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading timeline…</p>;
  }
  if (error || !route) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? 'Route not found'}
        </p>
        <Link className="text-sm text-teal-800 hover:underline" to="/admin/routes">
          Back to routes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-teal-800 hover:underline" to={`/admin/routes/${route.id}`}>
          Back to {route.reference}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-[#12355b]">{route.reference} timeline</h1>
          <StatusBadge status={route.status} />
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Status history and dispatch events. Location updates will attach here in Phase 8.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        {!canHistory ? (
          <p className="text-sm text-slate-500">You do not have permission to view route history.</p>
        ) : route.events.length === 0 ? (
          <p className="text-sm text-slate-500">No events recorded yet.</p>
        ) : (
          <ol className="space-y-4">
            {route.events.map((event) => (
              <li key={event.id} className="border-l-2 border-teal-200 pl-4">
                <p className="text-sm font-medium text-slate-900">
                  {event.previousStatus && event.status
                    ? `${routeStatusLabel(event.previousStatus)} → ${routeStatusLabel(event.status)}`
                    : (event.description ?? event.type.replaceAll('_', ' '))}
                </p>
                <p className="text-xs text-slate-500">
                  {event.type.replaceAll('_', ' ')} · {formatDate(event.occurredAt)}
                  {event.actorName ? ` · ${event.actorName}` : ''}
                  {event.location ? ` · ${event.location}` : ''}
                </p>
                {event.description && event.previousStatus ? (
                  <p className="mt-1 text-sm text-slate-600">{event.description}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
