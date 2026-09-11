import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastKind = 'ok' | 'error' | 'info'
type Toast = { id: number; kind: ToastKind; message: string }

type ToastCtx = {
  push: (message: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastCtx | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, kind: ToastKind = 'ok') => {
    const id = nextId++
    setToasts((rows) => [...rows, { id, kind, message }])
    window.setTimeout(() => {
      setToasts((rows) => rows.filter((row) => row.id !== id))
    }, 4200)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function PageHeader({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker?: string
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <header className="page-head">
      <div>
        {kicker ? <p className="page-kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="page-head-actions">{children}</div> : null}
    </header>
  )
}

export function EmptyState({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {body ? <p className="muted">{body}</p> : null}
      {children}
    </div>
  )
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  tone,
  hot,
}: {
  label: string
  value: string | number
  hint?: string
  tone: string
  hot?: boolean
}) {
  return (
    <article className={`kpi kpi-${tone}${hot ? ' kpi-hot' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </article>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p className="muted">{body}</p>
        <div className="actions">
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="empty-state empty-error">
      <strong>Could not load this view</strong>
      <p className="error">{message}</p>
    </div>
  )
}
