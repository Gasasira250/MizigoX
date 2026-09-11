import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createCustomer, listCustomers } from '../api'
import { EmptyState, PageHeader } from '../components/system'
import type { Customer } from '../types'

const empty = { name: '', contact: '', phone: '', email: '', notes: '' }

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([])
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  async function refresh() {
    setRows(await listCustomers())
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createCustomer(form)
      setForm(empty)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save customer')
    }
  }

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) =>
      [row.name, row.contact, row.phone, row.email, row.notes].join(' ').toLowerCase().includes(term),
    )
  }, [rows, q])

  return (
    <div>
      <PageHeader kicker="Management" title="Customers" subtitle="Shippers who post cargo on MizigoX." />
      <form className="panel form-grid" onSubmit={onSubmit}>
        <label>
          Company
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Contact
          <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          Email
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="span-2">
          Notes
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <div className="span-2 actions">
          <button type="submit">Add customer</button>
        </div>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <div className="toolbar filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" />
      </div>
      <div className="table-wrap panel">
        {visible.length === 0 ? (
          <EmptyState title="No customers in this view" body="Add a company or clear the search." />
        ) : (
          <table className="ops-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.contact || '—'}</td>
                  <td>{row.phone || '—'}</td>
                  <td>{row.email || '—'}</td>
                  <td>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
