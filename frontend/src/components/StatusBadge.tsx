import { STATUS_LABEL } from '../format'

export default function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status
  return (
    <span className={`badge badge-${status}`} aria-label={`Status: ${label}`}>
      {label}
    </span>
  )
}
