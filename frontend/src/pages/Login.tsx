import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { DEMOS } from '../demos'

const REMEMBER_KEY = 'mizigox.rememberEmail'

const FEATURES = [
  { title: 'Freight management', body: 'Post, quote, and dispatch cargo in one board.' },
  { title: 'Carrier management', body: 'Cover jobs with trucks and keep fleet assigned.' },
  { title: 'Shipment tracking', body: 'See live trucks, lanes, and status as freight moves.' },
  { title: 'Proof of delivery', body: 'Close trips with documents and a clear timeline.' },
]

export default function Login() {
  const { user, ready, signIn } = useAuth()
  const remembered = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_KEY) : ''
  const [email, setEmail] = useState<string>(remembered || '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(Boolean(remembered))
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (ready && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await signIn(email, password)
      if (remember) localStorage.setItem(REMEMBER_KEY, email)
      else localStorage.removeItem(REMEMBER_KEY)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      setError(
        /failed to fetch|networkerror|load failed/i.test(msg)
          ? 'Cannot reach the MizigoX API. Confirm the backend is running, then try again.'
          : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-intro" aria-label="MizigoX">
        <div className="login-intro-inner">
          <div className="brand">
            <span className="brand-mark">MX</span>
            <strong>MizigoX</strong>
          </div>
          <h1>Move cargo. Move business.</h1>
          <p>
            Freight operations for East African lanes — post cargo, dispatch carriers, track trucks, and close
            deliveries in USD.
          </p>
          <ul className="login-features">
            {FEATURES.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="login-auth">
        <form className="login-card" onSubmit={onSubmit}>
          <div className="login-card-brand">
            <span className="brand-mark">MX</span>
          </div>
          <div className="login-card-copy">
            <h1>Welcome back</h1>
            <p className="muted">Sign in to your MizigoX account</p>
            <p className="muted">
              <Link to="/">Back to home</Link>
            </p>
          </div>

          <label htmlFor="login-email">
            Email
            <input
              id="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              required
            />
          </label>

          <label htmlFor="login-password">
            Password
            <span className="password-field">
              <input
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M3.1 4.5 4.5 3.1 20.9 19.5 19.5 20.9 16.2 17.6A11.7 11.7 0 0 1 12 20C7 20 2.7 16.9 1 12.5c.7-1.8 1.8-3.4 3.2-4.7L3.1 4.5zM12 7.5A5 5 0 0 1 17 12c0 .6-.1 1.1-.3 1.6l-1.6-1.6A3 3 0 0 0 12 9.5c-.4 0-.7.1-1 .2L9.4 8.1A4.9 4.9 0 0 1 12 7.5zm0 9.5c.8 0 1.5-.2 2.2-.5l-1.6-1.6c-.2 0-.4.1-.6.1a3 3 0 0 1-3-3c0-.2 0-.4.1-.6L7.5 9.8A5 5 0 0 0 12 17z"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 5C7 5 2.7 8.1 1 12.5 2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5A5 5 0 1 1 12 7.5a5 5 0 0 1 0 10zm0-8a3 3 0 1 0 .01 6A3 3 0 0 0 12 9.5z"
                    />
                  </svg>
                )}
              </button>
            </span>
          </label>

          <div className="login-meta">
            <label className="login-remember" htmlFor="login-remember">
              <input
                id="login-remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <button
              type="button"
              className="login-forgot"
              onClick={() => setNotice('Ask your MizigoX administrator to reset access.')}
            >
              Forgot password
            </button>
          </div>

          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? <p className="hint">{notice}</p> : null}

          <button type="submit" className="btn login-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="login-demos">
            <p className="login-demos-label">Open demo as</p>
            <div className="demo-roles">
              {DEMOS.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  className={email === demo.email ? 'active ghost' : 'ghost'}
                  onClick={() => {
                    setEmail(demo.email)
                    setPassword(demo.password)
                    setError('')
                    setNotice('')
                  }}
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
