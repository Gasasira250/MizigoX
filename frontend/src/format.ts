export const STATUS_FLOW = ['posted', 'open', 'accepted', 'picked_up', 'in_transit', 'delivered'] as const

export const STATUS_LABEL: Record<string, string> = {
  posted: 'Request',
  open: 'Sourcing',
  accepted: 'Booked',
  picked_up: 'Dispatched',
  in_transit: 'In transit',
  delivered: 'Delivered',
  parked: 'Parked',
  available: 'Available',
  on_load: 'On a job',
  maintenance: 'Maintenance',
  off_duty: 'Off duty',
}

export const LIFECYCLE = [
  { key: 'request', status: 'posted', label: 'Request' },
  { key: 'sourcing', status: 'open', label: 'Sourcing' },
  { key: 'carrier', status: 'accepted', label: 'Carrier selected' },
  { key: 'booked', status: 'accepted', label: 'Booked' },
  { key: 'dispatched', status: 'picked_up', label: 'Dispatched' },
  { key: 'transit', status: 'in_transit', label: 'In transit' },
  { key: 'delivered', status: 'delivered', label: 'Delivered' },
  { key: 'pod', status: 'delivered', label: 'POD submitted' },
  { key: 'completed', status: 'delivered', label: 'Completed' },
] as const

export function hasPod(load: { documents?: { doc_type: string }[] | null }) {
  return Boolean(load.documents?.some((doc) => doc.doc_type === 'pod'))
}

export function lifecycleStep(load: { status: string; transporter_user_id?: number | null; documents?: { doc_type: string }[] | null }) {
  const order = ['posted', 'open', 'accepted', 'picked_up', 'in_transit', 'delivered']
  const idx = Math.max(0, order.indexOf(load.status))
  if (load.status !== 'delivered') {
    if (load.status === 'accepted' && load.transporter_user_id) return 3
    return idx
  }
  return hasPod(load) ? 8 : 6
}

export const NEXT_STATUS: Record<string, string | null> = {
  posted: null,
  open: null,
  accepted: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
  delivered: null,
}

export const VEHICLE_TYPES = [
  { id: 'double_diff', label: 'Double difference' },
  { id: 'single_diff', label: 'Single difference' },
  { id: 'horse_trailer', label: 'Horse and trailer' },
  { id: 'flatbed', label: 'Flatbed' },
  { id: 'container', label: 'Container truck' },
  { id: 'tanker', label: 'Tanker' },
  { id: 'reefer', label: 'Reefer' },
  { id: 'box', label: 'Box body' },
] as const

export const VEHICLE_LABEL: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPES.map((v) => [v.id, v.label]),
)

export const URGENCY_TYPES = [
  { id: 'standard', label: 'Standard' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'same_day', label: 'Same day' },
] as const

export const URGENCY_LABEL: Record<string, string> = Object.fromEntries(
  URGENCY_TYPES.map((v) => [v.id, v.label]),
)

export const CURRENCY = 'USD'

export function money(n: number, currency = CURRENCY) {
  return n.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 })
}

export function weight(n?: number | null) {
  const tonnes = n ?? 0
  return `${tonnes.toLocaleString(undefined, { maximumFractionDigits: 2 })} t`
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

export function fromNow(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function canSeeEconomics(role?: string) {
  return isAdmin(role)
}

export function shipperName(load: { shipper?: { name?: string } | null; customer?: { name?: string } | null }) {
  return load.shipper?.name || load.customer?.name || 'Client'
}

export function isAdmin(role?: string) {
  return role === 'partner' || role === 'dispatcher' || role === 'owner' || role === 'admin'
}

export function isCustomer(role?: string) {
  return role === 'customer'
}

export function isDriver(role?: string) {
  return role === 'driver'
}

export function isTransporter(role?: string) {
  return role === 'transporter'
}

export function roleLabel(role?: string) {
  if (isAdmin(role)) return 'Operations'
  if (role === 'customer') return 'Customer'
  if (role === 'transporter') return 'Carrier'
  if (role === 'driver') return 'Driver'
  return role || ''
}

export type AppRole = 'ops' | 'customer' | 'carrier' | 'driver'

export function appRole(role?: string): AppRole {
  if (isAdmin(role)) return 'ops'
  if (role === 'customer') return 'customer'
  if (role === 'transporter') return 'carrier'
  return 'driver'
}

export function attentionKindLabel(kind?: string) {
  if (kind === 'posted' || kind === 'driver') return 'Carrier pending'
  if (kind === 'pickup' || kind === 'urgency') return 'Shipment delayed'
  if (kind === 'pod') return 'POD overdue'
  if (kind === 'payment') return 'Payment pending'
  if (kind === 'fleet') return 'Fleet'
  return kind || 'Alert'
}

export function notificationKindLabel(kind?: string) {
  if (kind === 'posted') return 'New freight request'
  if (kind === 'broadcast') return 'Freight request'
  if (kind === 'accepted') return 'Carrier selected'
  if (kind === 'driver_assigned') return 'Shipment dispatched'
  if (kind === 'picked_up' || kind === 'dispatched') return 'Shipment dispatched'
  if (kind === 'delayed' || kind === 'urgency') return 'Shipment delayed'
  if (kind === 'pod' || kind === 'pod_submitted') return 'POD submitted'
  if (kind === 'delivered' || kind === 'completed') return 'Delivery completed'
  if (kind === 'payment' || kind === 'quote') return 'Payment / quote'
  return 'Alert'
}
