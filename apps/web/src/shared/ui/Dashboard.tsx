import { Link } from 'react-router-dom';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold text-[#12355b]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string | number;
  detail?: string;
  href?: string;
}) {
  const content = (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#12355b]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </article>
  );
  if (!href) {
    return content;
  }
  return (
    <Link
      to={href}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
    >
      {content}
    </Link>
  );
}

export function StatusChart({
  title,
  items,
}: {
  title: string;
  items: Array<{ status: string; count: number }>;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-[#12355b]">{title}</h2>
      {items.length === 0 || total === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No status data yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.status}>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>{item.status.replaceAll('_', ' ')}</span>
                <span>{item.count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#12355b]"
                  style={{ width: `${Math.max(4, (item.count / total) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AlertList({
  alerts,
}: {
  alerts: Array<{ id: string; severity: string; title: string; detail: string; href?: string }>;
}) {
  if (alerts.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#12355b]">Alerts</h2>
        <p className="mt-3 text-sm text-slate-500">No operational alerts right now.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-[#12355b]">Alerts</h2>
      <ul className="mt-3 space-y-2">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className={`rounded-md px-3 py-2 text-sm ${
              alert.severity === 'critical'
                ? 'bg-red-50 text-red-800'
                : alert.severity === 'warning'
                  ? 'bg-amber-50 text-amber-900'
                  : 'bg-slate-50 text-slate-700'
            }`}
          >
            {alert.href ? (
              <Link className="font-medium hover:underline" to={alert.href}>
                {alert.title}
              </Link>
            ) : (
              <p className="font-medium">{alert.title}</p>
            )}
            <p className="mt-0.5 text-xs opacity-80">{alert.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecentActivity({
  title,
  items,
  empty,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; title: string; detail: string; occurredAt?: string; href?: string }>;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-[#12355b]">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="py-2">
              {item.href ? (
                <Link className="text-sm font-medium text-[#12355b] hover:underline" to={item.href}>
                  {item.title}
                </Link>
              ) : (
                <p className="text-sm font-medium text-slate-800">{item.title}</p>
              )}
              <p className="text-xs text-slate-500">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function QuickActions({
  actions,
}: {
  actions: Array<{ label: string; href: string; hidden?: boolean }>;
}) {
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-wrap gap-2">
      {visible.map((action) => (
        <Link
          key={action.href}
          to={action.href}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
        >
          {action.label}
        </Link>
      ))}
    </section>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500" role="status">
      {label}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-800 hover:bg-red-100"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function ResponsiveTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">{children}</div>;
}
