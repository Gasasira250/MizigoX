import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  acceptLoad,
  assignLoad,
  broadcastLoad,
  coverLoad,
  downloadDocument,
  getLoad,
  getLoadTracking,
  listDrivers,
  listTrailers,
  listTrucks,
  pingLocation,
  updateLoadStatus,
  uploadDocument,
} from '../api'
import { useAuth } from '../auth'
import LiveMap from '../components/LiveMap'
import Lifecycle from '../components/Lifecycle'
import StatusBadge from '../components/StatusBadge'
import { ConfirmDialog, ErrorState, PageHeader, Skeleton, useToast } from '../components/system'
import {
  canSeeEconomics,
  formatWhen,
  fromNow,
  hasPod,
  isAdmin,
  isCustomer,
  isDriver,
  isTransporter,
  LIFECYCLE,
  lifecycleStep,
  money,
  NEXT_STATUS,
  shipperName,
  STATUS_LABEL,
  URGENCY_LABEL,
  VEHICLE_LABEL,
  weight,
} from '../format'
import type { Driver, Load, Trailer, TrackingTruck, Truck } from '../types'

export default function LoadDetailPage() {
  const { user } = useAuth()
  const toast = useToast()
  const { id } = useParams()
  const loadId = Number(id)
  const [load, setLoad] = useState<Load | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [assign, setAssign] = useState({ driver_id: '', truck_id: '', trailer_id: '' })
  const [cover, setCover] = useState({ trucks_provided: '1', truck_id: '', driver_id: '', truck_details: '' })
  const [docType, setDocType] = useState('bol')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState<TrackingTruck[]>([])
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; run: () => Promise<void> } | null>(
    null,
  )

  const fleetAccess = isAdmin(user?.role) || isTransporter(user?.role)
  const economics = canSeeEconomics(user?.role)

  async function refresh() {
    const row = await getLoad(loadId)
    setLoad(row)
    setAssign({
      driver_id: row.driver_id ? String(row.driver_id) : '',
      truck_id: row.truck_id ? String(row.truck_id) : '',
      trailer_id: row.trailer_id ? String(row.trailer_id) : '',
    })
    setCover((c) => ({
      ...c,
      trucks_provided: String(row.trucks_needed || 1),
      truck_id: row.truck_id ? String(row.truck_id) : c.truck_id,
    }))
    if (fleetAccess) {
      const [d, t, tr] = await Promise.all([listDrivers(), listTrucks(), listTrailers()])
      setDrivers(d)
      setTrucks(t)
      setTrailers(tr)
    }
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
  }, [loadId])

  useEffect(() => {
    if (!['accepted', 'picked_up', 'in_transit'].includes(load?.status || '')) return
    const pull = () => getLoadTracking(loadId).then(setLive).catch(() => undefined)
    pull()
    const timer = window.setInterval(pull, 8000)
    return () => window.clearInterval(timer)
  }, [loadId, load?.status])

  async function runAction(fn: () => Promise<void>, ok: string) {
    setBusy(true)
    setError('')
    try {
      await fn()
      toast.push(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

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
      toast.push('Driver and truck assigned')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed')
    } finally {
      setBusy(false)
    }
  }

  async function onCover(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setLoad(
        await coverLoad(loadId, {
          trucks_provided: Number(cover.trucks_provided || 1),
          truck_id: cover.truck_id ? Number(cover.truck_id) : null,
          driver_id: cover.driver_id ? Number(cover.driver_id) : null,
          truck_details: cover.truck_details,
        }),
      )
      toast.push('Job accepted with truck details')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept job')
    } finally {
      setBusy(false)
    }
  }

  function onShareGps() {
    if (!navigator.geolocation) {
      setError('This browser cannot share GPS')
      return
    }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await pingLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, load_id: loadId })
          setLive(await getLoadTracking(loadId))
          toast.push('Location shared')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not share location')
        } finally {
          setBusy(false)
        }
      },
      () => {
        setBusy(false)
        setError('Location permission was denied')
      },
    )
  }

  async function onUpload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await uploadDocument(loadId, file, docType)
      await refresh()
      toast.push('Document uploaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  if (!load && !error) {
    return (
      <div>
        <PageHeader kicker="Shipment" title="Cargo" subtitle="Loading shipment…" />
        <Skeleton rows={8} />
      </div>
    )
  }
  if (!load) return <ErrorState message={error} />

  const next = NEXT_STATUS[load.status]
  const canTake =
    isDriver(user?.role) && !load.driver_id && (load.status === 'open' || load.status === 'accepted')
  const canCover = (isTransporter(user?.role) || isAdmin(user?.role)) && load.status === 'open'
  const canBroadcast = isAdmin(user?.role) && load.status === 'posted'
  const canAdvance = Boolean(next) && (isDriver(user?.role) || isAdmin(user?.role) || isTransporter(user?.role))
  const pods = (load.documents ?? []).filter((d) => d.doc_type === 'pod')
  const otherDocs = (load.documents ?? []).filter((d) => d.doc_type !== 'pod')
  const customer = isCustomer(user?.role)
  const carrier = isTransporter(user?.role)
  const driver = isDriver(user?.role)
  const quoteLabel = economics
    ? 'Customer quote'
    : carrier
      ? 'Your payout'
      : driver
        ? 'Trip pay'
        : 'Your quote'
  const step = LIFECYCLE[lifecycleStep(load)]
  const podReady = load.status === 'delivered' && !hasPod(load)

  return (
    <div className="shipment-page">
      <p className="crumb">
        <Link to="/loads">Shipments</Link> / {load.reference}
      </p>
      <PageHeader
        kicker="Shipment"
        title={load.reference}
        subtitle={`${load.commodity || 'Cargo'} · ${weight(load.weight_tonnes)} · ${URGENCY_LABEL[load.urgency || ''] ?? load.urgency}`}
      >
        <span className="updated-pill">Updated {fromNow(load.updated_at)}</span>
        <StatusBadge status={load.status} />
      </PageHeader>
      <Lifecycle load={load} />
      <p className="lifecycle-now">
        Current stage: <strong>{step.label}</strong>
        {podReady ? ' · POD still required to close this file.' : ''}
      </p>

      {error ? <p className="error">{error}</p> : null}

      <section className="route-strip">
        <div>
          <span>Loading</span>
          <strong>{load.pickup_location}</strong>
          <em>{formatWhen(load.pickup_window_start)}</em>
        </div>
        <div className="route-arrow" aria-hidden="true">
          →
        </div>
        <div>
          <span>Delivery</span>
          <strong>{load.delivery_location}</strong>
          <em>{formatWhen(load.delivery_window_start)}</em>
        </div>
        <div>
          <span>ETA</span>
          <strong>{formatWhen(load.delivery_window_start)}</strong>
        </div>
      </section>

      {podReady ? (
        <p className="ops-alert">
          Proof of delivery is still outstanding on {load.reference}. Upload a POD to close the shipment.
        </p>
      ) : null}

      {live.length ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Live truck location</h2>
            <span>
              {live[0].unit_number} · {Math.round(live[0].speed_kmh)} km/h
            </span>
          </div>
          <LiveMap trucks={live} focus={live[0]} />
        </section>
      ) : null}

      <section className="ship-layout">
        <div className="ship-main">
      <section className="detail-grid">
        <article className="panel">
          <h2>Shipment</h2>
          <dl className="meta">
            <div>
              <dt>Shipment ID</dt>
              <dd>{load.reference}</dd>
            </div>
            {driver ? null : (
              <div>
                <dt>Customer</dt>
                <dd>{shipperName(load)}</dd>
              </div>
            )}
            <div>
              <dt>Origin</dt>
              <dd>{load.pickup_location}</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{load.delivery_location}</dd>
            </div>
            <div>
              <dt>Cargo</dt>
              <dd>
                {load.commodity || '—'}
                {load.container_count ? ` · ${load.container_count} containers` : ''}
              </dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{weight(load.weight_tonnes)}</dd>
            </div>
            <div>
              <dt>Vehicle requirement</dt>
              <dd>
                {VEHICLE_LABEL[load.vehicle_type || ''] ?? load.vehicle_type}
                {load.truck_spec ? ` · ${load.truck_spec}` : ''}
              </dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd>
                <StatusBadge status={load.status} />
              </dd>
            </div>
            <div>
              <dt>Carrier</dt>
              <dd>{load.transporter?.name ?? 'Awaiting carrier'}</dd>
            </div>
            <div>
              <dt>Driver</dt>
              <dd>{load.driver?.name ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Vehicle</dt>
              <dd>{load.truck?.unit_number ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>ETA</dt>
              <dd>{formatWhen(load.delivery_window_start)}</dd>
            </div>
            <div>
              <dt>{quoteLabel}</dt>
              <dd>{money(load.rate)}</dd>
            </div>
            {driver ? null : (
              <div>
                <dt>Trucks needed</dt>
                <dd>{load.trucks_needed ?? 1}</dd>
              </div>
            )}
            <div className="span-2">
              <dt>Cargo information</dt>
              <dd>{load.notes || '—'}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>Parties & assets</h2>
          <dl className="meta">
            <div>
              <dt>Carrier</dt>
              <dd>{load.transporter?.name ?? 'Awaiting carrier'}</dd>
            </div>
            <div>
              <dt>Driver</dt>
              <dd>{load.driver?.name ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Vehicle</dt>
              <dd>{load.truck?.unit_number ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Trailer</dt>
              <dd>{load.trailer?.unit_number ?? '—'}</dd>
            </div>
            {customer ? null : (
              <div className="span-2">
                <dt>Truck details</dt>
                <dd>
                  {load.trucks_provided
                    ? `${load.trucks_provided} truck(s). ${load.truck_details || ''}`
                    : 'Carrier has not provided truck details yet.'}
                </dd>
              </div>
            )}
          </dl>
        </article>
      </section>

        {economics && load.customer_price != null ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Financials</h2>
            <span>Operations only</span>
          </div>
          <div className="econ-strip econ-strip-5">
            <div>
              <span>Customer quote</span>
              <strong>{money(load.customer_price)}</strong>
            </div>
            <div>
              <span>Carrier cost</span>
              <strong>{money(load.carrier_cost || 0)}</strong>
            </div>
            <div>
              <span>Operations fees</span>
              <strong className="muted-value">Not recorded</strong>
            </div>
            <div>
              <span>Other costs</span>
              <strong className="muted-value">Not recorded</strong>
            </div>
            <div>
              <span>MizigoX margin</span>
              <strong>{money(load.gross_margin || 0)}</strong>
            </div>
          </div>
          <p className="hint">
            Operations fees and other costs are not stored on this shipment. Margin is the operations take on the
            customer quote. {load.quote_breakdown}
          </p>
        </section>
      ) : null}

      <section className="detail-grid">
        <article className="panel">
          <h2>Loading</h2>
          <dl className="meta">
            <div>
              <dt>Location</dt>
              <dd>{load.pickup_location}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>
                {formatWhen(load.pickup_window_start)}
                {load.pickup_window_end ? ` – ${formatWhen(load.pickup_window_end)}` : ''}
              </dd>
            </div>
          </dl>
        </article>
        <article className="panel">
          <h2>Delivery</h2>
          <dl className="meta">
            <div>
              <dt>Location</dt>
              <dd>{load.delivery_location}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd>
                {formatWhen(load.delivery_window_start)}
                {load.delivery_window_end ? ` – ${formatWhen(load.delivery_window_end)}` : ''}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="detail-grid">
        <article className="panel">
          <h2>Timeline</h2>
          {(load.events ?? []).length === 0 ? (
            <p className="muted">No events yet.</p>
          ) : (
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
          )}
        </article>

        <article className={`panel${podReady ? ' pod-needed' : ''}`}>
          <div className="panel-head">
            <h2>POD & documents</h2>
            {pods.length ? <span>Submitted</span> : <span className="count-hot">POD pending</span>}
          </div>
          {!customer ? (
            <div className="toolbar">
              <select value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="bol">BOL</option>
                <option value="pod">POD</option>
                <option value="rate_con">Rate confirmation</option>
                <option value="other">Other</option>
              </select>
              <input type="file" onChange={(e) => onUpload(e.target.files?.[0])} />
            </div>
          ) : null}
          <p className="mini-label">Proof of delivery</p>
          {pods.length === 0 ? <p className="muted">No POD uploaded yet.</p> : null}
          <ul className="doc-list">
            {pods.map((doc) => (
              <li key={doc.id}>
                <span>
                  <strong>{doc.filename}</strong>
                  <em>POD · {formatWhen(doc.uploaded_at)}</em>
                </span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    downloadDocument(loadId, doc.id, doc.filename).catch((err: Error) => setError(err.message))
                  }
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
          <p className="mini-label">Other documents</p>
          <ul className="doc-list">
            {otherDocs.length === 0 ? <li className="muted">No other documents yet.</li> : null}
            {otherDocs.map((doc) => (
              <li key={doc.id}>
                <span>
                  <strong>{doc.filename}</strong>
                  <em>{doc.doc_type.replace('_', ' ')}</em>
                </span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    downloadDocument(loadId, doc.id, doc.filename).catch((err: Error) => setError(err.message))
                  }
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        </article>
      </section>
        </div>

        <aside className="panel ship-rail">
          <div className="panel-head">
            <h2>Operational actions</h2>
          </div>
          {canBroadcast ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: 'Send to carriers',
                  body: `This will put ${load.reference} on the market for every carrier and driver.`,
                  label: 'Send job',
                  run: async () => {
                    setLoad(await broadcastLoad(loadId))
                  },
                })
              }
            >
              Send to carriers
            </button>
          ) : null}
          {canTake ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: 'Take this job',
                  body: `Assign ${load.reference} to you and start the trip workflow.`,
                  label: 'Take job',
                  run: async () => {
                    setLoad(await acceptLoad(loadId))
                  },
                })
              }
            >
              Take this job
            </button>
          ) : null}
          {driver && load.driver_id && ['accepted', 'picked_up', 'in_transit'].includes(load.status) ? (
            <button type="button" className="ghost" disabled={busy} onClick={onShareGps}>
              Share live GPS
            </button>
          ) : null}
          {canCover ? (
            <form onSubmit={onCover} className="stack">
              <label>
                Trucks you will send
                <input
                  type="number"
                  min="1"
                  required
                  value={cover.trucks_provided}
                  onChange={(e) => setCover({ ...cover, trucks_provided: e.target.value })}
                />
              </label>
              <label>
                Lead truck
                <select value={cover.truck_id} onChange={(e) => setCover({ ...cover, truck_id: e.target.value })}>
                  <option value="">Select unit</option>
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.unit_number} · {VEHICLE_LABEL[t.vehicle_type || ''] ?? t.vehicle_type} · {t.capacity_tonnes} t
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Driver (optional)
                <select value={cover.driver_id} onChange={(e) => setCover({ ...cover, driver_id: e.target.value })}>
                  <option value="">Drivers will take it</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Truck details for the client
                <textarea
                  rows={3}
                  value={cover.truck_details}
                  onChange={(e) => setCover({ ...cover, truck_details: e.target.value })}
                  placeholder="e.g. 10 double difference trucks, 28 t each, units T-101 to T-110"
                />
              </label>
              <button type="submit" disabled={busy}>
                Accept job and send truck details
              </button>
            </form>
          ) : null}
          {fleetAccess && load.status !== 'delivered' && load.status !== 'posted' ? (
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
                Assign driver & truck
              </button>
            </form>
          ) : null}
          {canAdvance && next ? (
            <div className="advance">
              <input
                placeholder="Optional status note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: `Mark ${STATUS_LABEL[next]}`,
                    body: `Move ${load.reference} from ${STATUS_LABEL[load.status]} to ${STATUS_LABEL[next]}.`,
                    label: `Mark ${STATUS_LABEL[next]}`,
                    run: async () => {
                      setLoad(await updateLoadStatus(loadId, next, note))
                      setNote('')
                    },
                  })
                }
              >
                Mark {STATUS_LABEL[next]}
              </button>
            </div>
          ) : customer ? (
            <p className="muted">You posted this cargo. Operations sends it to carriers, then a driver takes the job.</p>
          ) : load.status === 'delivered' ? (
            <p className="muted">{hasPod(load) ? 'This shipment is complete.' : 'Delivered — upload POD to close the file.'}</p>
          ) : (
            <p className="muted">No actions available on this shipment for your role.</p>
          )}
        </aside>
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        body={confirm?.body || ''}
        confirmLabel={confirm?.label}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && runAction(confirm.run, confirm.title)}
      />
    </div>
  )
}
