import { useEffect, useState } from 'react';
import type { HealthPayload, ReadinessPayload } from '@mizigox/shared';
import { ChangePasswordPanel } from '../auth/ChangePasswordPanel';
import { InviteUserPanel } from '../auth/InviteUserPanel';
import { apiGet } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';

interface StatusCard {
  label: string;
  value: string;
  detail: string;
}

export function FoundationPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [ready, setReady] = useState<ReadinessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [healthResult, readyResult] = await Promise.all([
          apiGet<HealthPayload>('/health'),
          apiGet<ReadinessPayload>('/health/ready'),
        ]);
        if (!cancelled) {
          setHealth(healthResult);
          setReady(readyResult);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to load system status');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards: StatusCard[] = [
    {
      label: 'API',
      value: health?.status === 'ok' ? 'Healthy' : 'Checking',
      detail: health ? `${health.service} ${health.version}` : 'Waiting for /health',
    },
    {
      label: 'PostgreSQL',
      value: ready?.checks.database.status === 'ok' ? 'Connected' : 'Checking',
      detail:
        ready?.checks.database.latencyMs !== undefined
          ? `${ready.checks.database.latencyMs} ms`
          : 'Waiting for /health/ready',
    },
    {
      label: 'Session',
      value: user?.role.replaceAll('_', ' ') ?? 'Unknown',
      detail: user?.email ?? '',
    },
    {
      label: 'Operating country',
      value: user?.organization.countryCode ?? '—',
      detail: `${user?.organization.name ?? ''} · ${user?.organization.defaultCurrencyCode ?? ''}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Phase 2</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">Identity and authentication</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Live database, session, and invite-based registration. Customers, shipments, and other
          operational modules are not implemented yet.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-xl font-semibold">{card.value}</p>
            <p className="mt-1 text-sm text-slate-500">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">Granted permissions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {user?.permissions.map((permission) => (
            <span
              key={permission}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
            >
              {permission}
            </span>
          ))}
        </div>
      </section>

      <InviteUserPanel />
      <ChangePasswordPanel />
    </div>
  );
}
