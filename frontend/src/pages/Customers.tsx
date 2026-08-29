import { useEffect, useState, type FormEvent } from 'react'
import { createCustomer, listCustomers } from '../api'
import type { Customer } from '../types'

const empty = { name: '', contact: '', phone: '', email: '', notes: '' }

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([])
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')

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

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Customers</h1>
          <p className="muted">Brokers and shippers you haul for.</p>
        </div>
      </header>
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
      <div className="table-wrap panel">
        <table>
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
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.contact}</td>
                <td>{row.phone}</td>
                <td>{row.email}</td>
                <td>{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
