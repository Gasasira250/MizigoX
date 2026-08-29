import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  assignLoad,
  downloadDocument,
  getLoad,
  listDrivers,
  listTrailers,
  listTrucks,
  updateLoadStatus,
  uploadDocument,
} from '../api'
import StatusBadge from '../components/StatusBadge'
import { formatWhen, money, NEXT_STATUS, STATUS_LABEL, weight } from '../format'
import type { Driver, Load, Trailer, Truck } from '../types'

export default function LoadDetailPage() {
  const { id } = useParams()
  const loadId = Number(id)
  const [load, setLoad] = useState<Load | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [assign, setAssign] = useState({ driver_id: '', truck_id: '', trailer_id: '' })
  const [docType, setDocType] = useState('bol')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const [row, d, t, tr] = await Promise.all([getLoad(loadId), listDrivers(), listTrucks(), listTrailers()])
    setLoad(row)
    setDrivers(d)
    setTrucks(t)
    setTrailers(tr)
    setAssign({
      driver_id: row.driver_id ? String(row.driver_id) : '',
      truck_id: row.truck_id ? String(row.truck_id) : '',
      trailer_id: row.trailer_id ? String(row.trailer_id) : '',
    })
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
  }, [loadId])

  async function onAssign(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const row = await assignLoad(loadId, {
        driver_id: Number(assign.driver_id),
        truck_id: Number(assign.truck_id),
        trailer_id: assign.trailer_id ? Number(assign.trailer_id) : null,
      })
      setLoad(row)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed')
    } finally {
      setBusy(false)
    }
  }

  async function onAdvance() {
    if (!load) return
    const next = NEXT_STATUS[load.status]
    if (!next) return
    setBusy(true)
    setError('')
    try {
      setLoad(await updateLoadStatus(loadId, next, note))
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed')
    } finally {
      setBusy(false)
    }
  }

  async function onUpload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await uploadDocument(loadId, file, docType)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  if (!load && !error) return <p className="muted">Loading load…</p>
  if (!load) return <p className="error">{error}</p>

  const next = NEXT_STATUS[load.status]

  return (
    <div>
      <header className="page-head">
        <div>
          <p className="crumb">
            <Link to="/loads">Loads</Link> / {load.reference}
          </p>
          <h1>{load.reference}</h1>
          <p className="muted">
            {load.pickup_location} → {load.delivery_location}
          </p>
        </div>
        <StatusBadge status={load.status} />
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="detail-grid">
        <article className="panel">
          <h2>Shipment</h2>
          <dl className="meta">
            <div>
              <dt>Customer</dt>
              <dd>{load.customer?.name}</dd>
            </div>
            <div>
              <dt>Commodity</dt>
              <dd>{load.commodity || '—'}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{weight(load.weight_lbs)}</dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>{money(load.rate)}</dd>
            </div>
            <div>
              <dt>Pickup window</dt>
              <dd>{formatWhen(load.pickup_window_start)}</dd>
            </div>
            <div>
              <dt>Delivery window</dt>
              <dd>{formatWhen(load.delivery_window_start)}</dd>
            </div>
            <div className="span-2">
              <dt>Notes</dt>
              <dd>{load.notes || '—'}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>Dispatch</h2>
          <p className="muted tight">
            {load.driver?.name ?? 'No driver'} · {load.truck?.unit_number ?? 'No truck'} ·{' '}
            {load.trailer?.unit_number ?? 'No trailer'}
          </p>
          {load.status !== 'delivered' ? (
            <form onSubmit={onAssign} className="stack">
              <label>
                Driver
                <select
                  required
                  value={assign.driver_id}
                  onChange={(e) => setAssign({ ...assign, driver_id: e.target.value })}
                >
                  <option value="">Select driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({STATUS_LABEL[d.status] ?? d.status})
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
                  <option value="">Select truck</option>
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.unit_number} ({STATUS_LABEL[t.status] ?? t.status})
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
                      {t.unit_number} ({STATUS_LABEL[t.status] ?? t.status})
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busy}>
                {load.status === 'booked' ? 'Assign & dispatch' : 'Reassign'}
              </button>
            </form>
          ) : null}

          {next ? (
            <div className="advance">
              <input
                placeholder="Optional status note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="button" className="btn" disabled={busy} onClick={onAdvance}>
                Mark {STATUS_LABEL[next]}
              </button>
            </div>
          ) : (
            <p className="muted">This load is complete.</p>
          )}
        </article>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <h2>Tracking</h2>
          <ol className="timeline">
            {(load.events ?? []).map((event) => (
              <li key={event.id}>
                <StatusBadge status={event.status} />
                <div>
                  <p>{event.note}</p>
                  <span className="muted">
                    {event.created_by} · {formatWhen(event.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </article>

        <article className="panel">
          <h2>Documents</h2>
          <div className="toolbar">
            <select value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="bol">BOL</option>
              <option value="pod">POD</option>
              <option value="rate_con">Rate confirmation</option>
              <option value="other">Other</option>
            </select>
            <input type="file" onChange={(e) => onUpload(e.target.files?.[0])} />
          </div>
          <ul className="doc-list">
            {(load.documents ?? []).length === 0 ? <li className="muted">No documents yet.</li> : null}
            {(load.documents ?? []).map((doc) => (
              <li key={doc.id}>
                <span>
                  <strong>{doc.filename}</strong>
                  <em>{doc.doc_type.replace('_', ' ')}</em>
                </span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => downloadDocument(loadId, doc.id, doc.filename).catch((err: Error) => setError(err.message))}
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  )
}
