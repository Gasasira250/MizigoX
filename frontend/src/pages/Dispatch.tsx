import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { acceptLoad, broadcastLoad, listLoads } from '../api'
import { useAuth } from '../auth'
import StatusBadge from '../components/StatusBadge'
import { PageHeader } from '../components/system'
import {
  formatWhen,
  isAdmin,
  isDriver,
  isTransporter,
  money,
  shipperName,
  URGENCY_LABEL,
  VEHICLE_LABEL,
  weight,
} from '../format'
import type { Load } from '../types'

function LoadCard({
  load,
  actionLabel,
  onAction,
}: {
  load: Load
  actionLabel?: string
  onAction?: () => void
}) {
  const navigate = useNavigate()
  return (
    <article
      className="load-card row-click"
      tabIndex={0}
      onClick={() => navigate(`/loads/${load.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/loads/${load.id}`)
        }
      }}
    >
      <div className="load-card-top">
        <Link to={`/loads/${load.id}`}>{load.reference}</Link>
        <StatusBadge status={load.status} />
      </div>
      <p>
        {load.pickup_location} → {load.delivery_location}
      </p>
      <p className="muted">
        {shipperName(load)} · {weight(load.weight_tonnes)} · {VEHICLE_LABEL[load.vehicle_type || ''] ?? load.vehicle_type} ·{' '}
        {URGENCY_LABEL[load.urgency || ''] ?? load.urgency}
      </p>
      <p className="muted">
        Load {formatWhen(load.pickup_window_start)} · {money(load.rate)} · {load.trucks_needed ?? 1} truck(s)
      </p>
      {load.trucks_provided ? <p>{load.trucks_provided} truck(s) provided. {load.truck_details}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
        >
          {actionLabel}
        </button>
      ) : (
        <Link to={`/loads/${load.id}`} onClick={(e) => e.stopPropagation()}>
          Open
        </Link>
      )}
    </article>
  )
}

export default function DispatchPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loads, setLoads] = useState<Load[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  async function refresh() {
    setLoads(await listLoads())
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
  }, [])

  const posted = loads.filter((l) => l.status === 'posted' && match(l))
  const open = loads.filter((l) => l.status === 'open' && match(l))
  const covered = loads.filter((l) => (l.status === 'accepted' || l.status === 'picked_up' || l.status === 'in_transit') && match(l))

  function match(load: Load) {
    const term = q.trim().toLowerCase()
    if (!term) return true
    return [load.reference, load.pickup_location, load.delivery_location, load.commodity, shipperName(load)]
      .join(' ')
      .toLowerCase()
      .includes(term)
  }

  async function sendOut(id: number) {
    setBusy(true)
    setError('')
    try {
      await broadcastLoad(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send job')
    } finally {
      setBusy(false)
    }
  }

  async function take(id: number) {
    setBusy(true)
    setError('')
    try {
      await acceptLoad(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not take job')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        kicker={isAdmin(user?.role) ? 'Operations' : isTransporter(user?.role) ? 'Carrier' : 'Driver'}
        title={isAdmin(user?.role) ? 'Freight requests' : isTransporter(user?.role) ? 'Open freight' : 'Driver jobs'}
        subtitle={
          isAdmin(user?.role)
            ? 'Client posts land here. Send each one to every carrier.'
            : isTransporter(user?.role)
              ? 'Accept a job and provide truck details to the client.'
              : 'Take a job. Loading date and urgency are on the card.'
        }
      />
      {error ? <p className="error">{error}</p> : null}
      <div className="toolbar filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requests" />
      </div>
      <div className="board board-3">
        {isAdmin(user?.role) ? (
          <section className="panel">
            <div className="panel-head">
              <h2>Client posts</h2>
              <span className={posted.length ? 'count-hot' : ''}>{posted.length}</span>
            </div>
            <div className="card-stack">
              {posted.map((load) => (
                <LoadCard
                  key={load.id}
                  load={load}
                  actionLabel={busy ? 'Sending…' : 'Send to carriers'}
                  onAction={() => sendOut(load.id)}
                />
              ))}
              {posted.length === 0 ? <p className="muted">No new client posts.</p> : null}
            </div>
          </section>
        ) : null}
        <section className="panel">
          <div className="panel-head">
            <h2>Open for carriers</h2>
            <span className={open.length ? 'count-hot' : ''}>{open.length}</span>
          </div>
          <div className="card-stack">
            {open.map((load) => (
              <LoadCard
                key={load.id}
                load={load}
                actionLabel={isTransporter(user?.role) ? 'Accept & provide trucks' : isDriver(user?.role) ? 'Take job' : undefined}
                onAction={
                  isTransporter(user?.role)
                    ? () => navigate(`/loads/${load.id}`)
                    : isDriver(user?.role)
                      ? () => take(load.id)
                      : undefined
                }
              />
            ))}
            {open.length === 0 ? <p className="muted">Nothing waiting on the market.</p> : null}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Covered / moving</h2>
            <span>{covered.length}</span>
          </div>
          <div className="card-stack">
            {covered.map((load) => (
              <LoadCard
                key={load.id}
                load={load}
                actionLabel={isDriver(user?.role) && !load.driver_id ? 'Take job' : undefined}
                onAction={isDriver(user?.role) && !load.driver_id ? () => take(load.id) : undefined}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
