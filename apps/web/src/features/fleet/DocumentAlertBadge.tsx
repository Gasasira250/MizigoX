import { documentAlertLabel, type DocumentAlert } from '@mizigox/shared';

const TONE: Record<DocumentAlert, string> = {
  expired: 'bg-red-50 text-red-700',
  today: 'bg-rose-50 text-rose-800',
  week: 'bg-amber-50 text-amber-800',
  month: 'bg-orange-50 text-orange-800',
  ok: 'bg-emerald-50 text-emerald-800',
  none: 'bg-slate-100 text-slate-600',
};

export function DocumentAlertBadge({ alert }: { alert: DocumentAlert }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${TONE[alert]}`}>
      {documentAlertLabel(alert)}
    </span>
  );
}
