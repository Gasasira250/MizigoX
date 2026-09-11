import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listDrivers, listPeople, listTrucks } from '../api'
import StatusBadge from '../components/StatusBadge'
import { PageHeader } from '../components/system'
import { roleLabel, VEHICLE_LABEL } from '../format'
import type { Driver, Truck, User } from '../types'

export default function TransportersPage() {
  const [people, setPeople] = useState<User[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    Promise.all([listPeople(), listTrucks(), listDrivers()])
      .then(([users, truckRows, driverRows]) => {
        setPeople(users)
        setTrucks(truckRows)
        setDrivers(driverRows)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const transporters = useMemo(() => people.filter((p) => p.role === 'transporter'), [people])
  const driverUsers = useMemo(() => people.filter((p) => p.role === 'driver'), [people])
  const term = q.trim().toLowerCase()
  const visibleCarriers = term
    ? transporters.filter((company) => [company.name, company.email, company.phone].join(' ').toLowerCase().includes(term))
    : transporters

  return (
    <div>
      <PageHeader kicker="Network" title="Carriers" subtitle="Companies that receive jobs from operations and send trucks to the customer." />
      {error ? <p className="error">{error}</p> : null}
      <div className="toolbar filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search carriers" />
      </div>
      {visibleCarriers.length === 0 ? <p className="muted">No carriers match this view.</p> : null}

      {visibleCarriers.map((company) => {
        const fleet = trucks.filter((t) => t.owner_user_id === company.id)
        const crew = drivers.filter((d) => d.owner_user_id === company.id)
        return (
          <section key={company.id} className="panel">
            <div className="panel-head">
              <h2>{company.name}</h2>
              <span>{roleLabel(company.role)}</span>
            </div>
            <p className="muted tight">
              {company.phone || 'No phone'} · {company.email}
            </p>
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Truck</th>
                    <th>Type</th>
                    <th>Capacity</th>
                    <th>Spec</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fleet.map((truck) => (
                    <tr key={truck.id}>
                      <td>{truck.unit_number}</td>
                      <td>{VEHICLE_LABEL[truck.vehicle_type || ''] ?? truck.vehicle_type}</td>
                      <td>{truck.capacity_tonnes ?? 28} t</td>
                      <td>{truck.spec || '—'}</td>
                      <td>
                        <StatusBadge status={truck.status} />
                      </td>
                    </tr>
                  ))}
                  {fleet.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No trucks on file yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Drivers: {crew.map((d) => d.name).join(', ') || 'None listed'}
            </p>
          </section>
        )
      })}

      <section className="panel">
        <div className="panel-head">
          <h2>Drivers on the app</h2>
          <span>{driverUsers.length}</span>
        </div>
        <p className="muted tight">Drivers get a notification when admin sends a job, then take it.</p>
        <ul className="doc-list">
          {driverUsers.map((d) => (
            <li key={d.id}>
              <span>
                <strong>{d.name}</strong>
                <em>{d.email}</em>
              </span>
              <Link to="/fleet">Fleet</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
