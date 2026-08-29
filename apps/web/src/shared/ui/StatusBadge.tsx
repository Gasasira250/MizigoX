export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'DELIVERED' || status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-800'
      : status === 'CANCELLED' || status === 'INACTIVE'
        ? 'bg-slate-100 text-slate-600'
        : status === 'EXCEPTION' || status === 'DELIVERY_FAILED'
          ? 'bg-red-50 text-red-700'
          : status === 'URGENT' || status === 'HIGH'
            ? 'bg-rose-50 text-rose-800'
            : status === 'IN_TRANSIT' ||
                status === 'OUT_FOR_DELIVERY' ||
                status === 'PICKED_UP' ||
                status === 'AT_DESTINATION'
              ? 'bg-amber-50 text-amber-800'
              : 'bg-sky-50 text-sky-800';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
