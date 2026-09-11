import { useEffect, useMemo, useState } from 'react'
import { listLoads } from '../api'
import { useAuth } from '../auth'
import ShipmentTable from '../components/ShipmentTable'
import { ErrorState, PageHeader, Skeleton } from '../components/system'
import { canSeeEconomics, isCustomer, isTransporter } from '../format'
import type { Load } from '../types'

export default function FinancePage({ kind }: { kind: 'quotes' | 'invoices' | 'payments' }) {
  const { user } = useAuth()
  const [loads, setLoads] = useState<Load[] | null>(null)
  const [error, setError] = useState('')
  const showEcon = canSeeEconomics(user?.role)
  const carrier = isTransporter(user?.role)

  useEffect(() => {
    listLoads(kind === 'quotes' ? undefined : { status: 'delivered' })
      .then(setLoads)
      .catch((err: Error) => setError(err.message))
  }, [kind])

  const rows = useMemo(() => {
    const data = loads ?? []
    if (kind === 'quotes') return data
    return data.filter((load) => load.status === 'delivered')
  }, [kind, loads])

  const copy =
    kind === 'quotes'
      ? {
          kicker: 'Finance',
          title: 'Quotes',
          subtitle: isCustomer(user?.role)
            ? 'Customer quotes on your freight requests.'
            : carrier
              ? 'Quoted jobs available to your fleet.'
              : 'Customer quotes on the book. Internal cost is hidden from customers.',
        }
      : kind === 'invoices'
        ? {
            kicker: 'Finance',
            title: 'Invoices',
            subtitle: 'Delivered shipments billed from the customer quote. No new invoice records are created.',
          }
        : {
            kicker: 'Finance',
            title: 'Payments',
            subtitle: carrier
              ? 'Payout view for delivered trips assigned to you.'
              : 'Settlement on delivered shipments from existing quotes.',
          }

  if (error && !loads) return <ErrorState message={error} />
  if (!loads) {
    return (
      <div>
        <PageHeader kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} />
        <Skeleton />
      </div>
    )
  }

  return (
    <div>
      <PageHeader kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} />
      <section className="panel panel-flush">
        <ShipmentTable
          loads={rows}
          showEconomics={showEcon}
          emptyTitle="Nothing in this view"
          emptyBody="Existing shipments will appear here when they match this stage."
        />
      </section>
    </div>
  )
}
