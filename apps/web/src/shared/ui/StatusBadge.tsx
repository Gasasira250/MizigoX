export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'DELIVERED' ||
    status === 'ACTIVE' ||
    status === 'AVAILABLE' ||
    status === 'VALID' ||
    status === 'COMPLETED' ||
    status === 'SERVICED' ||
    status === 'ARRIVED'
      ? 'bg-emerald-50 text-emerald-800'
      : status === 'CANCELLED' ||
          status === 'INACTIVE' ||
          status === 'RETIRED' ||
          status === 'OFF_DUTY' ||
          status === 'UNAVAILABLE' ||
          status === 'DRAFT' ||
          status === 'SKIPPED'
        ? 'bg-slate-100 text-slate-600'
        : status === 'EXCEPTION' ||
            status === 'DELIVERY_FAILED' ||
            status === 'EXPIRED' ||
            status === 'REVOKED' ||
            status === 'SUSPENDED'
          ? 'bg-red-50 text-red-700'
          : status === 'URGENT' || status === 'HIGH'
            ? 'bg-rose-50 text-rose-800'
            : status === 'IN_TRANSIT' ||
                status === 'OUT_FOR_DELIVERY' ||
                status === 'PICKED_UP' ||
                status === 'AT_DESTINATION' ||
                status === 'ON_TRIP' ||
                status === 'MAINTENANCE' ||
                status === 'DISPATCHED'
              ? 'bg-amber-50 text-amber-800'
              : status === 'ASSIGNED' ||
                  status === 'PENDING' ||
                  status === 'READY' ||
                  status === 'PLANNED'
                ? 'bg-indigo-50 text-indigo-800'
                : 'bg-sky-50 text-sky-800';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
