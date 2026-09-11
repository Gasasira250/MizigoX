import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createLoad, listCustomers, listDrivers, listLoads, listPeople, quoteLoad } from '../api'
import { useAuth } from '../auth'
import ShipmentTable from '../components/ShipmentTable'
import { ErrorState, PageHeader, Skeleton, useToast } from '../components/system'
import {
  fromLocalInput,
  isAdmin,
  isCustomer,
  isDriver,
  money,
  STATUS_FLOW,
  STATUS_LABEL,
  URGENCY_TYPES,
  VEHICLE_TYPES,
  weight,
} from '../format'
import type { Customer, Driver, Load, Quote, User } from '../types'

const emptyForm = {
  customer_id: '',
  pickup_location: 'Kampala, UG',
  pickup_window_start: '',
  delivery_location: 'Mombasa, KE',
  delivery_window_start: '',
  commodity: 'Steel',
  weight_tonnes: '20',
  container_count: '20',
  vehicle_type: 'double_diff',
  urgency: 'urgent',
  notes: '',
}

export default function LoadsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [loads, setLoads] = useState<Load[] | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [people, setPeople] = useState<User[]>([])
  const [status, setStatus] = useState(params.get('status') || '')
  const [q, setQ] = useState('')
  const [clientId, setClientId] = useState('')
  const [carrierId, setCarrierId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [open, setOpen] = useState(params.get('new') === '1')
  const [form, setForm] = useState(emptyForm)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canPost = isCustomer(user?.role) || isAdmin(user?.role)
  const admin = isAdmin(user?.role)

  type LoadFilters = {
    status?: string
    q?: string
    clientId?: string
    carrierId?: string
    driverId?: string
    dateFrom?: string
    dateTo?: string
  }

  function filterParams(next: LoadFilters = {}) {
    return {
      status: (next.status ?? status) || undefined,
      q: (next.q ?? q) || undefined,
      customer_id: Number(next.clientId ?? clientId) || undefined,
      transporter_id: Number(next.carrierId ?? carrierId) || undefined,
      driver_id: Number(next.driverId ?? driverId) || undefined,
      date_from: (next.dateFrom ?? dateFrom) ? new Date(next.dateFrom ?? dateFrom).toISOString() : undefined,
      date_to: (next.dateTo ?? dateTo) ? new Date(next.dateTo ?? dateTo).toISOString() : undefined,
    }
  }

  async function refresh(next: LoadFilters = {}) {
    const [loadRows, customerRows, driverRows, peopleRows] = await Promise.all([
      listLoads(filterParams(next)),
      admin ? listCustomers() : Promise.resolve([]),
      admin ? listDrivers() : Promise.resolve([]),
      admin ? listPeople() : Promise.resolve([]),
    ])
    setLoads(loadRows)
    setCustomers(customerRows)
    setDrivers(driverRows)
    setPeople(peopleRows.filter((p) => p.role === 'transporter'))
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!open || !form.pickup_location || !form.delivery_location) return
    const timer = window.setTimeout(() => {
      quoteLoad({
        pickup_location: form.pickup_location,
        delivery_location: form.delivery_location,
        weight_tonnes: Number(form.weight_tonnes || 0),
        vehicle_type: form.vehicle_type,
        urgency: form.urgency,
        container_count: Number(form.container_count || 0),
      })
        .then(setQuote)
        .catch(() => setQuote(null))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [
    open,
    form.pickup_location,
    form.delivery_location,
    form.weight_tonnes,
    form.vehicle_type,
    form.urgency,
    form.container_count,
  ])

  const filteredHint = useMemo(() => {
    const n = loads?.length ?? 0
    if (!status && !q && !clientId && !carrierId && !driverId && !dateFrom && !dateTo) return `${n} cargo jobs`
    return `${n} matching`
  }, [loads, status, q, clientId, carrierId, driverId, dateFrom, dateTo])

  async function applyFilters(patch: LoadFilters) {
    if (patch.status !== undefined) {
      setStatus(patch.status)
      const next = new URLSearchParams(params)
      if (patch.status) next.set('status', patch.status)
      else next.delete('status')
      setParams(next, { replace: true })
    }
    if (patch.q !== undefined) setQ(patch.q)
    if (patch.clientId !== undefined) setClientId(patch.clientId)
    if (patch.carrierId !== undefined) setCarrierId(patch.carrierId)
    if (patch.driverId !== undefined) setDriverId(patch.driverId)
    if (patch.dateFrom !== undefined) setDateFrom(patch.dateFrom)
    if (patch.dateTo !== undefined) setDateTo(patch.dateTo)
    try {
      await refresh(patch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Filter failed')
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await createLoad({
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        pickup_location: form.pickup_location,
        pickup_window_start: fromLocalInput(form.pickup_window_start),
        delivery_location: form.delivery_location,
        delivery_window_start: fromLocalInput(form.delivery_window_start),
        commodity: form.commodity,
        weight_tonnes: Number(form.weight_tonnes || 0),
        container_count: Number(form.container_count || 0),
        vehicle_type: form.vehicle_type,
        urgency: form.urgency,
        notes: form.notes,
      })
      setOpen(false)
      setForm(emptyForm)
      toast.push(`${created.reference} posted`)
      await refresh()
      navigate(`/loads/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post cargo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shipments-page">
      <PageHeader
        kicker={isCustomer(user?.role) ? 'Customer' : isDriver(user?.role) ? 'Driver' : admin ? 'Operations' : 'Carrier'}
        title="Shipments"
        subtitle={`${filteredHint}. Quotes are in USD only.`}
      >
        {canPost ? (
          <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'Post cargo'}
          </button>
        ) : null}
      </PageHeader>

      {open && canPost ? (
        <form className="panel form-grid" onSubmit={onCreate}>
          {isAdmin(user?.role) ? (
            <label>
              Client
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">Select client</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Client
              <input value={user?.name || ''} readOnly />
            </label>
          )}
          <label>
            Commodity
            <input
              required
              value={form.commodity}
              onChange={(e) => setForm({ ...form, commodity: e.target.value })}
              placeholder="Steel, produce, containers…"
            />
          </label>
          <label>
            Pickup / packing point
            <input
              required
              value={form.pickup_location}
              onChange={(e) => setForm({ ...form, pickup_location: e.target.value })}
              placeholder="Kampala, UG"
            />
          </label>
          <label>
            Loading date
            <input
              required
              type="datetime-local"
              value={form.pickup_window_start}
              onChange={(e) => setForm({ ...form, pickup_window_start: e.target.value })}
            />
          </label>
          <label>
            Delivery
            <input
              required
              value={form.delivery_location}
              onChange={(e) => setForm({ ...form, delivery_location: e.target.value })}
              placeholder="Mombasa, KE"
            />
          </label>
          <label>
            Delivery date
            <input
              type="datetime-local"
              value={form.delivery_window_start}
              onChange={(e) => setForm({ ...form, delivery_window_start: e.target.value })}
            />
          </label>
          <label>
            Weight to carry (tonnes)
            <input
              required
              type="number"
              min="0.1"
              step="0.1"
              value={form.weight_tonnes}
              onChange={(e) => setForm({ ...form, weight_tonnes: e.target.value })}
            />
          </label>
          <label>
            Containers
            <input
              type="number"
              min="0"
              value={form.container_count}
              onChange={(e) => setForm({ ...form, container_count: e.target.value })}
            />
          </label>
          <label>
            Vehicle type
            <select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Urgency
            <select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
              {URGENCY_TYPES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Cargo information
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="I, Hannington, have 20 containers of steel worth 20 tonnes. Packed on this date. Need a double difference truck."
            />
          </label>
          {quote ? (
            <div className="span-2 quote-box">
              <strong>{money(quote.rate)}</strong>
              <p>
                {quote.distance_km} km · {weight(quote.weight_tonnes)} · {quote.trucks_needed} {quote.vehicle_label.toLowerCase()} truck(s)
              </p>
              <p className="muted">{quote.breakdown}</p>
            </div>
          ) : null}
          <div className="span-2 actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Posting…' : 'Post cargo'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="status-tabs" role="tablist" aria-label="Shipment status">
        <button
          type="button"
          role="tab"
          aria-selected={!status}
          className={!status ? 'active' : ''}
          onClick={() => applyFilters({ status: '' })}
        >
          All
        </button>
        {STATUS_FLOW.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            className={status === s ? 'active' : ''}
            onClick={() => applyFilters({ status: s })}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="filter-card" role="search">
        <label className="filter-search">
          Search
          <input
            type="search"
            placeholder="Cargo, lane, or reference"
            value={q}
            onChange={(e) => applyFilters({ q: e.target.value })}
          />
        </label>
        {admin ? (
          <>
            <label>
              Client
              <select value={clientId} onChange={(e) => applyFilters({ clientId: e.target.value })}>
                <option value="">All clients</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Carrier
              <select value={carrierId} onChange={(e) => applyFilters({ carrierId: e.target.value })}>
                <option value="">All carriers</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Driver
              <select value={driverId} onChange={(e) => applyFilters({ driverId: e.target.value })}>
                <option value="">All drivers</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label>
          Pickup date
          <input type="date" value={dateFrom} onChange={(e) => applyFilters({ dateFrom: e.target.value })} />
        </label>
        <label>
          Delivery date
          <input type="date" value={dateTo} onChange={(e) => applyFilters({ dateTo: e.target.value })} />
        </label>
      </div>

      {error && !loads ? <ErrorState message={error} /> : null}
      {error && loads ? <p className="error">{error}</p> : null}
      {loads === null ? (
        <Skeleton rows={6} />
      ) : (
        <section className="panel panel-flush shipments-table-card">
          <ShipmentTable
            loads={loads}
            showEconomics={admin}
            emptyTitle="No cargo matches this view"
            emptyBody="Adjust search or filters, or post a new shipment."
          />
        </section>
      )}
    </div>
  )
}
