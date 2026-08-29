import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createLoad, listCustomers, listLoads } from '../api'
import StatusBadge from '../components/StatusBadge'
import { formatWhen, fromLocalInput, money, STATUS_FLOW, STATUS_LABEL, weight } from '../format'
import type { Customer, Load } from '../types'

const emptyForm = {
  customer_id: '',
  pickup_location: '',
  pickup_window_start: '',
  delivery_location: '',
  delivery_window_start: '',
  commodity: '',
  weight_lbs: '',
  rate: '',
  notes: '',
}

export default function LoadsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [loads, setLoads] = useState<Load[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(params.get('new') === '1')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh(nextStatus = status, nextQ = q) {
    const [loadRows, customerRows] = await Promise.all([
      listLoads({ status: nextStatus || undefined, q: nextQ || undefined }),
      listCustomers(),
    ])
    setLoads(loadRows)
    setCustomers(customerRows)
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
  }, [])

  const filteredHint = useMemo(() => {
    if (!status && !q) return `${loads.length} loads`
    return `${loads.length} matching`
  }, [loads.length, status, q])

  async function onFilter(nextStatus: string, nextQ: string) {
    setStatus(nextStatus)
    setQ(nextQ)
    try {
      await refresh(nextStatus, nextQ)
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
        customer_id: Number(form.customer_id),
        pickup_location: form.pickup_location,
        pickup_window_start: fromLocalInput(form.pickup_window_start),
        delivery_location: form.delivery_location,
        delivery_window_start: fromLocalInput(form.delivery_window_start),
        commodity: form.commodity,
        weight_lbs: Number(form.weight_lbs || 0),
        rate: Number(form.rate || 0),
        notes: form.notes,
      })
      setOpen(false)
      setForm(emptyForm)
      await refresh()
      navigate(`/loads/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create load')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Loads</h1>
          <p className="muted">{filteredHint}</p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'New load'}
        </button>
      </header>

      {open ? (
        <form className="panel form-grid" onSubmit={onCreate}>
          <label>
            Customer
            <select
              required
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
            >
              <option value="">Select broker / shipper</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Commodity
            <input value={form.commodity} onChange={(e) => setForm({ ...form, commodity: e.target.value })} />
          </label>
          <label>
            Pickup
            <input
              required
              value={form.pickup_location}
              onChange={(e) => setForm({ ...form, pickup_location: e.target.value })}
              placeholder="City, ST"
            />
          </label>
          <label>
            Pickup window
            <input
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
              placeholder="City, ST"
            />
          </label>
          <label>
            Delivery window
            <input
              type="datetime-local"
              value={form.delivery_window_start}
              onChange={(e) => setForm({ ...form, delivery_window_start: e.target.value })}
            />
          </label>
          <label>
            Weight (lbs)
            <input
              type="number"
              value={form.weight_lbs}
              onChange={(e) => setForm({ ...form, weight_lbs: e.target.value })}
            />
          </label>
          <label>
            Rate
            <input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          </label>
          <label className="span-2">
            Notes
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="span-2 actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Create load'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="toolbar">
        <input
          placeholder="Search reference, lane, commodity"
          value={q}
          onChange={(e) => onFilter(status, e.target.value)}
        />
        <select value={status} onChange={(e) => onFilter(e.target.value, q)}>
          <option value="">All statuses</option>
          {STATUS_FLOW.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap panel">
        <table>
          <thead>
            <tr>
              <th>Load</th>
              <th>Customer</th>
              <th>Lane</th>
              <th>Pickup</th>
              <th>Driver / truck</th>
              <th>Weight</th>
              <th>Rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loads.map((load) => (
              <tr key={load.id}>
                <td>
                  <Link to={`/loads/${load.id}`}>{load.reference}</Link>
                </td>
                <td>{load.customer?.name}</td>
                <td>
                  {load.pickup_location} → {load.delivery_location}
                </td>
                <td>{formatWhen(load.pickup_window_start)}</td>
                <td>
                  {load.driver?.name ?? 'Unassigned'}
                  {load.truck ? ` · ${load.truck.unit_number}` : ''}
                </td>
                <td>{weight(load.weight_lbs)}</td>
                <td>{money(load.rate)}</td>
                <td>
                  <StatusBadge status={load.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
