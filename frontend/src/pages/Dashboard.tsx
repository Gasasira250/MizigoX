import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard } from '../api'
import { useAuth } from '../auth'
import ShipmentTable from '../components/ShipmentTable'
import StatusBadge from '../components/StatusBadge'
import { ErrorState, KpiCard, PageHeader, Skeleton } from '../components/system'
import {
  attentionKindLabel,
  canSeeEconomics,
  formatWhen,
  fromNow,
  isAdmin,
  isCustomer,
  isTransporter,
  money,
  shipperName,
} from '../format'
import type { AttentionItem, Dashboard, Load } from '../types'

function attentionAction(kind: string) {
  if (kind === 'posted') return { label: 'Review request', to: '/dispatch' }
  if (kind === 'driver') return { label: 'Assign driver', to: '/fleet?tab=drivers' }
  if (kind === 'pickup') return { label: 'Cover job', to: '/dispatch' }
  if (kind === 'pod') return { label: 'Confirm POD', to: '/loads?status=delivered' }
  if (kind === 'fleet') return { label: 'Open fleet', to: '/fleet' }
  return { label: 'Open', to: '/loads' }
}

function severityRank(severity: string) {
  if (severity === 'danger') return 0
  if (severity === 'warn') return 1
  return 2
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState<Date | null>(null)

  async function refresh() {
    const row = await getDashboard()
    setData(row)
    setUpdated(new Date())
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined)
    }, 12000)
    return () => window.clearInterval(timer)
  }, [user?.id])

  if (error && !data) return <ErrorState message={error} />
  if (!data) {
    return (
      <div className="ops-page">
        <PageHeader kicker="Operations" title="Overview" subtitle="Loading live cargo, fleet, and exceptions…" />
        <Skeleton rows={8} />
      </div>
    )
  }

  const admin = isAdmin(user?.role)
  const client = isCustomer(user?.role)
  const transporter = isTransporter(user?.role)
  const showEcon = canSeeEconomics(user?.role)
  const availability = data.availability
  const activity = data.recent_activity ?? []
  const attentionItems: AttentionItem[] = [...(data.attention ?? [])]
  if (admin && data.delivered > 0) {
    const deliveredLoad = [...(data.recent_loads ?? []), ...(data.active_shipments ?? [])].find(
      (load) => load.status === 'delivered',
    )
    attentionItems.unshift({
      kind: 'pod',
      title: `${data.delivered} POD overdue`,
      message: 'Delivered shipments still waiting for proof of delivery.',
      load_id: deliveredLoad?.id ?? null,
      reference: deliveredLoad?.reference ?? null,
      severity: 'warn',
    })
  }
  attentionItems.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))

  const awaitingCarrier = (data.posted_jobs ?? 0) + data.open_jobs
  const bookedIdle = Math.max(0, data.active_trips - data.loads_in_transit)
  const activeLoads: Load[] = data.active_shipments?.length ? data.active_shipments : data.recent_loads

  if (admin) {
    const cards = [
      { label: 'Active shipments', value: data.active_trips, tone: 'info', hint: 'Booked and moving', to: '/loads' },
      { label: 'Awaiting carrier', value: awaitingCarrier, tone: 'warn', hint: 'Request or sourcing', to: '/dispatch' },
      { label: 'POD pending', value: data.delivered, tone: 'warn', hint: 'Delivered — confirm POD', to: '/loads?status=delivered' },
      { label: 'Revenue', value: money(data.economics?.customer_price ?? data.earnings), tone: 'ok', hint: 'Customer quotes', to: '/reports' },
      { label: 'MizigoX margin', value: money(data.economics?.gross_margin ?? 0), tone: 'ok', hint: `${data.economics?.margin_pct ?? 0}% of quotes`, to: '/reports' },
      { label: 'Exceptions', value: attentionItems.length, tone: 'warn', hint: 'Needs a decision', to: '#attention' },
    ]

    const pipeline = [
      { label: 'Request', value: data.posted_jobs ?? 0, hint: 'Client posts', to: '/dispatch' },
      { label: 'Sourcing', value: data.open_jobs, hint: 'With carriers', to: '/dispatch' },
      { label: 'Booked', value: bookedIdle, hint: 'Accepted, not moving', to: '/loads' },
      { label: 'In transit', value: data.loads_in_transit, hint: 'Dispatched and rolling', to: '/tracking' },
      { label: 'Delivered', value: data.delivered, hint: 'Close with POD', to: '/loads?status=delivered' },
    ]

    return (
      <div className="ops-page ops-control">
        <PageHeader kicker="Operations" title="Overview" subtitle="What needs my attention right now?">
          <span className="updated-pill" title={updated?.toLocaleTimeString()}>
            <span className="topbar-live">Live</span>
            {fromNow(data.last_updated || updated?.toISOString())}
          </span>
          <Link to="/loads?new=1" className="btn">
            Post cargo
          </Link>
        </PageHeader>

        {error ? <p className="error">{error}</p> : null}

        <section className="kpi-grid kpi-grid-6" aria-label="Live operations">
          {cards.map((card) => (
            <Link
              key={card.label}
              to={card.to}
              className="dash-kpi-link"
              aria-label={`${card.label}: ${card.value}`}
            >
              <KpiCard
                label={card.label}
                value={card.value}
                hint={card.hint}
                tone={card.tone}
                hot={card.tone === 'warn' && Number(card.value) > 0}
              />
            </Link>
          ))}
        </section>

        <section className="panel dash-pipeline" aria-label="Shipment status">
          <div className="panel-head">
            <h2>Network status</h2>
            <span>
              {data.pickups_today} loading today · {data.deliveries_today} delivering
            </span>
          </div>
          <ol className="dash-funnel">
            {pipeline.map((step, index) => (
              <li key={step.label} className={step.value > 0 ? 'has-work' : ''}>
                <Link to={step.to}>
                  <em>{String(index + 1).padStart(2, '0')}</em>
                  <strong>{step.value}</strong>
                  <span>{step.label}</span>
                  <small>{step.hint}</small>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <div className="dash-board">
          <section className="panel panel-flush" id="attention">
            <div className="panel-head">
              <h2>Attention required</h2>
              {attentionItems.length ? <span className="count-hot">{attentionItems.length}</span> : null}
            </div>
            {attentionItems.length === 0 ? (
              <p className="empty-inline">Nothing needs a decision right now. The board is clear.</p>
            ) : (
              <ul className="attention-list dash-queue">
                {attentionItems.map((item, i) => {
                  const action = attentionAction(item.kind)
                  const to = item.load_id ? `/loads/${item.load_id}` : action.to
                  return (
                    <li key={`${item.kind}-${item.load_id ?? i}`} className={`attention-item sev-${item.severity}`}>
                      <div>
                        <span className={`attention-kind kind-${item.severity}`}>{attentionKindLabel(item.kind)}</span>
                        <strong>{item.title}</strong>
                        <p>{item.message}</p>
                      </div>
                      <Link to={to} className="btn ghost">
                        {item.reference || action.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Today’s board</h2>
              <span>
                {data.pickups_today} / {data.deliveries_today}
              </span>
            </div>
            <div className="today-cols">
              <DayList title="Loading" empty="No pickups on today’s window." rows={data.today_pickups ?? []} field="pickup" />
              <DayList title="Delivering" empty="No deliveries on today’s window." rows={data.today_deliveries ?? []} field="delivery" />
            </div>
          </section>
        </div>

        {showEcon && data.economics ? (
          <section className="econ-strip" aria-label="Shipment economics">
            <div>
              <span>Customer quote</span>
              <strong>{money(data.economics.customer_price)}</strong>
            </div>
            <div>
              <span>Carrier cost</span>
              <strong>{money(data.economics.carrier_cost)}</strong>
            </div>
            <div>
              <span>MizigoX margin</span>
              <strong>{money(data.economics.gross_margin)}</strong>
            </div>
            <div>
              <span>Margin</span>
              <strong>{data.economics.margin_pct}%</strong>
            </div>
          </section>
        ) : null}

        <section className="panel panel-flush">
          <div className="panel-head">
            <h2>Active shipments</h2>
            <Link to="/loads">All shipments</Link>
          </div>
          <ShipmentTable
            loads={activeLoads}
            showEconomics={showEcon}
            pageSize={8}
            emptyTitle="No active shipments"
            emptyBody="Accepted and moving cargo will list here."
          />
        </section>

        <div className="ops-split">
          <section className="panel">
            <div className="panel-head">
              <h2>Recent shipment activity</h2>
            </div>
            {activity.length === 0 ? (
              <p className="empty-inline">No status changes yet.</p>
            ) : (
              <ol className="activity-list dash-activity">
                {activity.map((item) => (
                  <li key={item.id}>
                    <StatusBadge status={item.status} />
                    <div>
                      <Link to={`/loads/${item.load_id}`}>{item.reference}</Link>
                      <p>{item.note}</p>
                      <span className="muted">
                        {item.created_by} · {fromNow(item.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {availability ? (
            <section className="panel">
              <div className="panel-head">
                <h2>Fleet availability</h2>
                <Link to="/fleet">Fleet</Link>
              </div>
              <div className="avail-grid dash-avail">
                <div>
                  <span>Trucks free</span>
                  <strong>{availability.trucks_available}</strong>
                </div>
                <div>
                  <span>On a job</span>
                  <strong>{availability.trucks_on_load}</strong>
                </div>
                <div>
                  <span>Maintenance</span>
                  <strong>{availability.trucks_maintenance}</strong>
                </div>
                <div>
                  <span>Drivers free</span>
                  <strong>{availability.drivers_available}</strong>
                </div>
                <div>
                  <span>Drivers on job</span>
                  <strong>{availability.drivers_on_load}</strong>
                </div>
                <div>
                  <span>Off duty</span>
                  <strong>{availability.drivers_off_duty}</strong>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    )
  }

  const cards = client
    ? [
        { label: 'Active shipments', value: data.active_trips, tone: 'ok', hint: 'Moving now' },
        { label: 'Awaiting carrier', value: awaitingCarrier, tone: 'warn', hint: 'Not yet booked' },
        { label: 'Delivered', value: data.delivered, tone: 'ok', hint: 'Complete' },
        { label: 'Quote total', value: money(data.earnings), tone: 'ok', hint: 'Your delivered quotes' },
      ]
    : transporter
      ? [
          { label: 'Active shipments', value: data.active_trips, tone: 'info', hint: 'Your booked work' },
          { label: 'Awaiting carrier', value: data.open_jobs, tone: 'warn', hint: 'Open for your fleet' },
          { label: 'Need drivers', value: data.awaiting_drivers ?? 0, tone: 'warn', hint: 'Covered, no driver' },
          { label: 'Trucks free', value: data.trucks_available, tone: 'ok', hint: 'In your fleet' },
        ]
      : [
          { label: 'Open jobs', value: data.open_jobs, tone: 'warn', hint: 'Available trips' },
          { label: 'My trips', value: data.active_trips, tone: 'info', hint: 'Assigned to you' },
          { label: 'Delivered', value: data.delivered, tone: 'ok', hint: 'Complete' },
          { label: 'Trip pay', value: money(data.earnings), tone: 'ok', hint: 'Your delivered jobs' },
        ]

  const title = client ? 'Overview' : transporter ? 'Carrier overview' : 'Driver overview'
  const kicker = client ? 'Customer' : transporter ? 'Carrier' : 'Driver'
  const subtitle = client
    ? 'Your shipments, quotes, and live trips.'
    : transporter
      ? 'Open jobs, your trucks, and driver coverage.'
      : 'Open jobs and the trip assigned to you.'

  return (
    <div className="ops-page">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle}>
        <span className="updated-pill" title={updated?.toLocaleTimeString()}>
          <span className="topbar-live">Live</span>
          {fromNow(data.last_updated || updated?.toISOString())}
        </span>
        {client ? (
          <Link to="/loads?new=1" className="btn">
            Post cargo
          </Link>
        ) : (
          <Link to="/loads" className="btn">
            View jobs
          </Link>
        )}
      </PageHeader>

      {error ? <p className="error">{error}</p> : null}

      <section className="kpi-grid" aria-label="Live operations">
        {cards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
            tone={card.tone}
            hot={card.tone === 'warn' && Number(card.value) > 0}
          />
        ))}
      </section>

      {!client && attentionItems.length ? (
        <section className="panel panel-flush">
          <div className="panel-head">
            <h2>Attention required</h2>
            <span className="count-hot">{attentionItems.length}</span>
          </div>
          <ul className="attention-list">
            {attentionItems.map((item, i) => (
              <li key={`${item.kind}-${item.load_id ?? i}`} className={`attention-item sev-${item.severity}`}>
                <div>
                  <span className="attention-kind">{attentionKindLabel(item.kind)}</span>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                </div>
                {item.load_id ? <Link to={`/loads/${item.load_id}`}>{item.reference || 'Open'}</Link> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!client && !transporter ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Assigned trip</h2>
            <Link to="/loads">Jobs</Link>
          </div>
          {activeLoads.filter((load) => ['accepted', 'picked_up', 'in_transit'].includes(load.status)).length === 0 ? (
            <p className="empty-inline">No trip assigned. Open jobs are on the freight board.</p>
          ) : (
            <ul className="mini-list dash-day">
              {activeLoads
                .filter((load) => ['accepted', 'picked_up', 'in_transit'].includes(load.status))
                .map((load) => (
                  <li key={load.id} className="trip-card">
                    <div className="dash-day-top">
                      <Link to={`/loads/${load.id}`}>{load.reference}</Link>
                      <StatusBadge status={load.status} />
                    </div>
                    <span>
                      {load.pickup_location} → {load.delivery_location}
                    </span>
                    <span>ETA {formatWhen(load.delivery_window_start)} · {load.truck?.unit_number || 'Vehicle unassigned'}</span>
                    <Link to={`/loads/${load.id}`} className="btn ghost">
                      Open trip
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </section>
      ) : null}

      {client || transporter ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Today</h2>
            <span>
              {data.pickups_today} load · {data.deliveries_today} deliver
            </span>
          </div>
          <div className="today-cols">
            <DayList title="Loading" empty="No pickups on today’s window." rows={data.today_pickups ?? []} field="pickup" />
            <DayList title="Delivering" empty="No deliveries on today’s window." rows={data.today_deliveries ?? []} field="delivery" />
          </div>
        </section>
      ) : null}

      {transporter && availability ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Your fleet</h2>
            <Link to="/fleet">Vehicles</Link>
          </div>
          <div className="avail-grid dash-avail">
            <div>
              <span>Trucks free</span>
              <strong>{availability.trucks_available}</strong>
            </div>
            <div>
              <span>On a job</span>
              <strong>{availability.trucks_on_load}</strong>
            </div>
            <div>
              <span>Drivers free</span>
              <strong>{availability.drivers_available}</strong>
            </div>
            <div>
              <span>Drivers on job</span>
              <strong>{availability.drivers_on_load}</strong>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel panel-flush">
        <div className="panel-head">
          <h2>{client ? 'Your shipments' : transporter ? 'Your jobs' : 'Jobs'}</h2>
          <Link to="/loads">View all</Link>
        </div>
        <ShipmentTable
          loads={activeLoads}
          emptyTitle={client ? 'No shipments yet' : 'No jobs in this view'}
          emptyBody={client ? 'Post cargo to get a quote and start a shipment.' : 'Open freight will appear here when operations sends work.'}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent shipment activity</h2>
        </div>
        {activity.length === 0 ? (
          <p className="muted">No status changes yet.</p>
        ) : (
          <ol className="activity-list">
            {activity.map((item) => (
              <li key={item.id}>
                <StatusBadge status={item.status} />
                <div>
                  <Link to={`/loads/${item.load_id}`}>{item.reference}</Link>
                  <p>{item.note}</p>
                  <span className="muted">
                    {item.created_by} · {fromNow(item.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function DayList({
  title,
  empty,
  rows,
  field,
}: {
  title: string
  empty: string
  rows: Load[]
  field: 'pickup' | 'delivery'
}) {
  return (
    <div>
      <p className="mini-label">{title}</p>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="mini-list dash-day">
          {rows.map((load) => (
            <li key={load.id}>
              <div className="dash-day-top">
                <Link to={`/loads/${load.id}`}>{load.reference}</Link>
                <StatusBadge status={load.status} />
              </div>
              <span>
                {field === 'pickup' ? load.pickup_location : load.delivery_location} ·{' '}
                {formatWhen(field === 'pickup' ? load.pickup_window_start : load.delivery_window_start)}
              </span>
              <span>{shipperName(load)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
