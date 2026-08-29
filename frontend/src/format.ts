export const STATUS_FLOW = ['open', 'accepted', 'picked_up', 'in_transit', 'delivered'] as const

export const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  accepted: 'Accepted',
  picked_up: 'Picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  available: 'Available',
  on_load: 'On a job',
  maintenance: 'Maintenance',
  off_duty: 'Off duty',
}

export const NEXT_STATUS: Record<string, string | null> = {
  open: null,
  accepted: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
  delivered: null,
}

export const VEHICLE_LABEL: Record<string, string> = {
  bike: 'Bike / scooter',
  van: 'Van',
  truck: 'Truck',
  any: 'Any vehicle',
}

export function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function weight(n: number) {
  return `${Math.round(n).toLocaleString()} lbs`
}

export function formatWhen(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null
}

export function shipperName(load: { shipper?: { name?: string } | null; customer?: { name?: string } | null }) {
  return load.shipper?.name || load.customer?.name || 'Shipper'
}
