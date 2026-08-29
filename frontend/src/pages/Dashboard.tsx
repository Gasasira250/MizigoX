import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard } from '../api'
import StatusBadge from '../components/StatusBadge'
import { formatWhen, money } from '../format'
import type { Dashboard } from '../types'

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard().then(setData).catch((err: Error) => setError(err.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading dashboard…</p>

  const cards = [
    { label: 'In transit', value: data.loads_in_transit },
    { label: 'Unassigned booked', value: data.loads_booked },
    { label: 'Pickups today', value: data.pickups_today },
    { label: 'Deliveries today', value: data.deliveries_today },
    { label: 'Trucks available', value: data.trucks_available },
    { label: 'Trucks on load', value: data.trucks_on_load },
    { label: 'Drivers available', value: data.drivers_available },
  ]

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Operations</h1>
          <p className="muted">Today’s board for Mizigox fleet dispatch.</p>
        </div>
        <Link to="/loads?new=1" className="btn">
          New load
        </Link>
      </header>
      <section className="kpi-grid">
        {cards.map((card) => (
          <article key={card.label} className="kpi">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Recent loads</h2>
          <Link to="/loads">View all</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Load</th>
                <th>Customer</th>
                <th>Lane</th>
                <th>Pickup</th>
                <th>Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_loads.map((load) => (
                <tr key={load.id}>
                  <td>
                    <Link to={`/loads/${load.id}`}>{load.reference}</Link>
                  </td>
                  <td>{load.customer?.name}</td>
                  <td>
                    {load.pickup_location} → {load.delivery_location}
                  </td>
                  <td>{formatWhen(load.pickup_window_start)}</td>
                  <td>{money(load.rate)}</td>
                  <td>
                    <StatusBadge status={load.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
