import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Login() {
  const { user, ready, signIn } = useAuth()
  const [email, setEmail] = useState('dispatcher@mizigox.com')
  const [password, setPassword] = useState('dispatcher')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (ready && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">
          <span className="brand-mark">MX</span>
          <div>
            <strong>Mizigox</strong>
            <span>Carrier TMS</span>
          </div>
        </div>
        <h1>Sign in</h1>
        <p className="muted">Dispatch loads, assign trucks, and keep paperwork on the move.</p>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="hint">Demo: dispatcher@mizigox.com / dispatcher</p>
      </form>
    </div>
  )
}
