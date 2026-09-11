import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getLiveTrucks } from '../api'
import { useAuth } from '../auth'
import LiveMap from '../components/LiveMap'
import StatusBadge from '../components/StatusBadge'
import { EmptyState, ErrorState, PageHeader } from '../components/system'
import { fromNow, isAdmin, isCustomer, isTransporter, VEHICLE_LABEL } from '../format'
import type { TrackingTruck } from '../types'

type View = 'active' | 'exceptions' | 'all'

export default function TrackingPage() {
  const { user } = useAuth()
  const [trucks, setTrucks] = useState<TrackingTruck[]>([])
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [view, setView] = useState<View>('active')

  async function refresh() {
    setTrucks(await getLiveTrucks())
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [])

  const moving = trucks.filter((t) => t.load_id && (t.load_status === 'in_transit' || t.load_status === 'picked_up'))
  const exceptions = useMemo(
    () => trucks.filter((t) => t.load_id && t.speed_kmh < 1 && (t.load_status === 'in_transit' || t.load_status === 'picked_up')),
    [trucks],
  )
  const active = trucks.filter((t) => Boolean(t.load_id))
  const visible = useMemo(() => {
    const pool = view === 'exceptions' ? exceptions : view === 'active' ? active : trucks
    const term = q.trim().toLowerCase()
    if (!term) return pool
    return pool.filter((truck) =>
      [truck.unit_number, truck.driver_name, truck.reference, truck.pickup_location, truck.delivery_location]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [trucks, q, view, exceptions, active])
  const focus = trucks.find((t) => t.truck_id === selected) || visible[0] || null

  return (
    <div className="ops-control">
      <PageHeader
        kicker={isAdmin(user?.role) ? 'Operations' : isCustomer(user?.role) ? 'Customer' : isTransporter(user?.role) ? 'Carrier' : 'Driver'}
        title="Tracking"
        subtitle="Active shipments, exceptions, and the existing GPS feed."
      >
        <span className="ops-stat">{moving.length} in transit</span>
      </PageHeader>
      {error ? <ErrorState message={error} /> : null}

      <section className="kpi-grid tracking-kpis" aria-label="Tracking snapshot">
        <article className="kpi kpi-info">
          <span>Active shipments</span>
          <strong>{active.length}</strong>
          <em>Units with a load</em>
        </article>
        <article className={`kpi kpi-warn${exceptions.length ? ' kpi-hot' : ''}`}>
          <span>Exceptions</span>
          <strong>{exceptions.length}</strong>
          <em>In transit at 0 km/h</em>
        </article>
        <article className="kpi kpi-info">
          <span>In transit</span>
          <strong>{moving.length}</strong>
          <em>Dispatched or rolling</em>
        </article>
        <article className="kpi kpi-ok">
          <span>Yard / idle</span>
          <strong>{trucks.length - active.length}</strong>
          <em>No shipment assigned</em>
        </article>
      </section>

      <div className="tracking-shell tracking-shell-3">
        <div className="tracking-map">
          <LiveMap trucks={trucks} focus={focus} />
        </div>
        <aside className="panel tracking-side">
          <div className="panel-head">
            <h2>Shipments</h2>
            <span>{visible.length}</span>
          </div>
          <div className="status-pills tracking-filters">
            <button type="button" className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>
              Active
            </button>
            <button type="button" className={view === 'exceptions' ? 'active' : ''} onClick={() => setView('exceptions')}>
              Exceptions
            </button>
            <button type="button" className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
              All units
            </button>
          </div>
          <div className="toolbar filters">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search unit, driver, lane" />
          </div>
          {visible.length === 0 ? (
            <EmptyState title="Nothing in this view" body="Active loads from the existing GPS feed will appear here." />
          ) : (
            <ul className="tracking-list">
              {visible.map((truck) => {
                const stopped = exceptions.some((row) => row.truck_id === truck.truck_id)
                return (
                  <li key={truck.truck_id}>
                    <button
                      type="button"
                      className={`tracking-item${focus?.truck_id === truck.truck_id ? ' on' : ''}${stopped ? ' exception' : ''}`}
                      onClick={() => setSelected(truck.truck_id)}
                    >
                      <strong>{truck.reference || truck.unit_number}</strong>
                      <span>
                        {truck.driver_name || 'No driver'} · {truck.unit_number}
                      </span>
                      <span className="cell-sub">
                        {truck.pickup_location && truck.delivery_location
                          ? `${truck.pickup_location} → ${truck.delivery_location}`
                          : 'Yard'}
                      </span>
                      <StatusBadge status={truck.load_status || truck.status} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
        <aside className="panel tracking-side">
          {focus ? (
            <div className="tracking-detail">
              <div className="panel-head">
                <h2>Details</h2>
                {exceptions.some((row) => row.truck_id === focus.truck_id) ? <span className="count-hot">Exception</span> : null}
              </div>
              <dl className="meta">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={focus.load_status || focus.status} />
                  </dd>
                </div>
                <div>
                  <dt>Driver</dt>
                  <dd>{focus.driver_name || '—'}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd>
                    {focus.unit_number} · {VEHICLE_LABEL[focus.vehicle_type] ?? focus.vehicle_type}
                  </dd>
                </div>
                <div>
                  <dt>Lane</dt>
                  <dd>
                    {focus.pickup_location && focus.delivery_location
                      ? `${focus.pickup_location} → ${focus.delivery_location}`
                      : 'Yard'}
                  </dd>
                </div>
                <div>
                  <dt>ETA</dt>
                  <dd>{focus.load_id ? 'Delivery window is on the shipment file' : '—'}</dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>{Math.round(focus.speed_kmh)} km/h</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{fromNow(focus.location_updated_at)}</dd>
                </div>
              </dl>
              {focus.load_id ? (
                <Link className="btn" to={`/loads/${focus.load_id}`}>
                  Open {focus.reference}
                </Link>
              ) : (
                <p className="muted">Yard — no active shipment on this unit.</p>
              )}
            </div>
          ) : (
            <EmptyState title="Select a unit" body="Choose a shipment from the list to see driver, vehicle, and status." />
          )}
        </aside>
      </div>
    </div>
  )
}
