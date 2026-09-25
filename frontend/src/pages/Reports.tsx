import { useEffect, useState } from 'react'
import { getDashboard } from '../api'
import { useAuth } from '../auth'
import { ErrorState, PageHeader, Skeleton } from '../components/system'
import { canSeeEconomics, money } from '../format'
import type { Dashboard } from '../types'

export default function ReportsPage() {
  const { user } = useAuth()
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [user?.id])

  if (error && !data) return <ErrorState message={error} />
  if (!data) {
    return (
      <div>
        <PageHeader kicker="Management" title="Reports" subtitle="Snapshot from live operations data." />
        <Skeleton />
      </div>
    )
  }

  const showEcon = canSeeEconomics(user?.role)

  return (
    <div>
      <PageHeader kicker="Management" title="Reports" subtitle="Counts and quote totals from current operations data." />
      <section className="kpi-grid kpi-grid-6">
        <article className="kpi kpi-info">
          <span>Active shipments</span>
          <strong>{data.active_trips}</strong>
        </article>
        <article className="kpi kpi-warn">
          <span>Awaiting carrier</span>
          <strong>{(data.posted_jobs ?? 0) + data.open_jobs}</strong>
        </article>
        <article className="kpi kpi-ok">
          <span>Delivered</span>
          <strong>{data.delivered}</strong>
        </article>
        <article className="kpi kpi-info">
          <span>In transit</span>
          <strong>{data.loads_in_transit}</strong>
        </article>
        {showEcon && data.economics ? (
          <>
            <article className="kpi kpi-ok">
              <span>Revenue</span>
              <strong>{money(data.economics.customer_price)}</strong>
            </article>
            <article className="kpi kpi-ok">
              <span>MizigoX margin</span>
              <strong>{money(data.economics.gross_margin)}</strong>
            </article>
          </>
        ) : null}
      </section>
    </div>
  )
}
