import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatWhen, money, shipperName, URGENCY_LABEL } from '../format'
import type { Load } from '../types'
import { EmptyState } from './system'
import StatusBadge from './StatusBadge'

type SortKey = 'reference' | 'customer' | 'lane' | 'pickup' | 'rate' | 'status'

function compare(a: string | number, b: string | number, dir: 'asc' | 'desc') {
  const mul = dir === 'asc' ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * mul
}

export default function ShipmentTable({
  loads,
  showEconomics,
  emptyTitle = 'No shipments in this view',
  emptyBody = 'When cargo is posted it will appear here.',
  pageSize = 12,
}: {
  loads: Load[]
  showEconomics?: boolean
  emptyTitle?: string
  emptyBody?: string
  pageSize?: number
}) {
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortKey>('pickup')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage(0)
  }, [loads])

  function toggle(key: SortKey) {
    if (sort === key) setDir((value) => (value === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setDir(key === 'reference' || key === 'customer' ? 'asc' : 'desc')
    }
    setPage(0)
  }

  const sorted = useMemo(() => {
    const rows = [...loads]
    rows.sort((a, b) => {
      if (sort === 'reference') return compare(a.reference, b.reference, dir)
      if (sort === 'customer') return compare(shipperName(a), shipperName(b), dir)
      if (sort === 'lane') return compare(`${a.pickup_location} ${a.delivery_location}`, `${b.pickup_location} ${b.delivery_location}`, dir)
      if (sort === 'pickup') return compare(a.pickup_window_start || '', b.pickup_window_start || '', dir)
      if (sort === 'rate') return compare(a.rate, b.rate, dir)
      return compare(a.status, b.status, dir)
    })
    return rows
  }, [loads, sort, dir])

  if (loads.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />
  }

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pages - 1)
  const slice = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  function mark(key: SortKey, label: string) {
    return (
      <button type="button" className="th-sort" onClick={() => toggle(key)}>
        {label}
        {sort === key ? <span aria-hidden="true">{dir === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    )
  }

  return (
    <div className="table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th>{mark('reference', 'Shipment')}</th>
            <th>{mark('customer', 'Customer')}</th>
            <th>{mark('lane', 'Lane')}</th>
            <th>{mark('pickup', 'Load time')}</th>
            <th>Carrier / driver</th>
            <th className="num">{mark('rate', 'USD')}</th>
            {showEconomics ? <th className="num">Margin</th> : null}
            <th>{mark('status', 'Status')}</th>
            <th className="row-actions-cell"> </th>
          </tr>
        </thead>
        <tbody>
          {slice.map((load) => (
            <tr
              key={load.id}
              className={`row-click${
                load.status === 'posted' || load.status === 'accepted'
                  ? ' row-attention'
                  : load.status === 'in_transit' || load.status === 'picked_up'
                    ? ' row-moving'
                    : ''
              }`}
              tabIndex={0}
              onClick={() => navigate(`/loads/${load.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/loads/${load.id}`)
                }
              }}
            >
              <td>
                <Link to={`/loads/${load.id}`} className="ref-link" onClick={(e) => e.stopPropagation()}>
                  {load.reference}
                </Link>
                <div
                  className={`cell-sub${
                    load.urgency === 'same_day' ? ' cell-urgent-hot' : load.urgency === 'urgent' ? ' cell-urgent' : ''
                  }`}
                >
                  {load.commodity || 'Cargo'}
                  {load.urgency && load.urgency !== 'standard'
                    ? ` · ${URGENCY_LABEL[load.urgency] ?? load.urgency}`
                    : ''}
                </div>
              </td>
              <td>{shipperName(load)}</td>
              <td>
                <div className="lane">
                  <span>{load.pickup_location}</span>
                  <span>{load.delivery_location}</span>
                </div>
              </td>
              <td className="nowrap">{formatWhen(load.pickup_window_start)}</td>
              <td>
                {load.transporter?.name || '—'}
                <div className="cell-sub">{load.driver?.name || load.truck?.unit_number || 'Unassigned'}</div>
              </td>
              <td className="num">{money(load.rate)}</td>
              {showEconomics ? (
                <td className="num">
                  {load.gross_margin != null ? money(load.gross_margin) : '—'}
                  {load.margin_pct != null ? <div className="cell-sub">{load.margin_pct}%</div> : null}
                </td>
              ) : null}
              <td>
                <StatusBadge status={load.status} />
              </td>
              <td className="row-actions-cell" onClick={(e) => e.stopPropagation()}>
                <Link to={`/loads/${load.id}`} className="btn ghost table-action" aria-label={`Open ${load.reference}`}>
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > pageSize ? (
        <div className="table-foot">
          <span>
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="table-pager">
            <button type="button" className="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              Previous
            </button>
            <button type="button" className="ghost" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
