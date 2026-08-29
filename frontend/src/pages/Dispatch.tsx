import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { assignLoad, listDrivers, listLoads, listTrailers, listTrucks } from '../api'
import StatusBadge from '../components/StatusBadge'
import { formatWhen, money, STATUS_LABEL } from '../format'
import type { Driver, Load, Trailer, Truck } from '../types'

export default function DispatchPage() {
  const [loads, setLoads] = useState<Load[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [assign, setAssign] = useState({ driver_id: '', truck_id: '', trailer_id: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const [all, d, t, tr] = await Promise.all([listLoads(), listDrivers(), listTrucks(), listTrailers()])
    setLoads(all.filter((l) => l.status !== 'delivered'))
    setDrivers(d)
    setTrucks(t)
    setTrailers(tr)
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
  }, [])

  const unassigned = loads.filter((l) => l.status === 'booked')
  const moving = loads.filter((l) => l.status !== 'booked')

  async function onAssign(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await assignLoad(selected, {
        driver_id: Number(assign.driver_id),
        truck_id: Number(assign.truck_id),
        trailer_id: assign.trailer_id ? Number(assign.trailer_id) : null,
      })
      setSelected(null)
      setAssign({ driver_id: '', truck_id: '', trailer_id: '' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed')
    } finally {
      setBusy(false)
    }
  }

  function LoadCard({ load, action }: { load: Load; action?: boolean }) {
    return (
      <article className="load-card">
        <div className="load-card-top">
          <Link to={`/loads/${load.id}`}>{load.reference}</Link>
          <StatusBadge status={load.status} />
        </div>
        <p>
          {load.pickup_location} → {load.delivery_location}
        </p>
        <p className="muted">
          {load.customer?.name} · {formatWhen(load.pickup_window_start)} · {money(load.rate)}
        </p>
        {load.driver ? (
          <p className="muted">
            {load.driver.name} · {load.truck?.unit_number}
          </p>
        ) : null}
        {action ? (
          <button type="button" onClick={() => setSelected(load.id)}>
            Assign
          </button>
        ) : (
          <Link to={`/loads/${load.id}`}>Open</Link>
        )}
      </article>
    )
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Dispatch board</h1>
          <p className="muted">Assign available trucks to booked freight.</p>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      <div className="board">
        <section className="panel">
          <div className="panel-head">
            <h2>Unassigned</h2>
            <span>{unassigned.length}</span>
          </div>
          <div className="card-stack">
            {unassigned.map((load) => (
              <LoadCard key={load.id} load={load} action />
            ))}
            {unassigned.length === 0 ? <p className="muted">Nothing waiting on a truck.</p> : null}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Covered / moving</h2>
            <span>{moving.length}</span>
          </div>
          <div className="card-stack">
            {moving.map((load) => (
              <LoadCard key={load.id} load={load} />
            ))}
          </div>
        </section>
      </div>

      {selected ? (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onAssign}>
            <h2>Assign equipment</h2>
            <label>
              Driver
              <select
                required
                value={assign.driver_id}
                onChange={(e) => setAssign({ ...assign, driver_id: e.target.value })}
              >
                <option value="">Select</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({STATUS_LABEL[d.status]})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Truck
              <select
                required
                value={assign.truck_id}
                onChange={(e) => setAssign({ ...assign, truck_id: e.target.value })}
              >
                <option value="">Select</option>
                {trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.unit_number} ({STATUS_LABEL[t.status]})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trailer
              <select
                value={assign.trailer_id}
                onChange={(e) => setAssign({ ...assign, trailer_id: e.target.value })}
              >
                <option value="">None</option>
                {trailers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.unit_number} ({STATUS_LABEL[t.status]})
                  </option>
                ))}
              </select>
            </label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button type="submit" disabled={busy}>
                Dispatch
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
