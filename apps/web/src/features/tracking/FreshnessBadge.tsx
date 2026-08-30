import { trackingFreshnessLabel } from '@mizigox/shared';
import { StatusBadge } from '../../shared/ui/StatusBadge';

export function FreshnessBadge({ freshness }: { freshness: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge status={freshness} />
      <span className="text-xs text-slate-500">{trackingFreshnessLabel(freshness)}</span>
    </span>
  );
}
