import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../api'
import { useAuth } from '../auth'
import GlobalSearch from './GlobalSearch'
import Icon from './Icon'
import PwaInstall from './PwaInstall'
import { DEMOS } from '../demos'
import { appRole, formatWhen, fromNow, notificationKindLabel, roleLabel } from '../format'
import { NAV } from '../nav'
import type { AppNotification } from '../types'

const COLLAPSE_KEY = 'mizigox.sidebarCollapsed'
const GROUPS_KEY = 'mizigox.navGroups'

function isLinkActive(to: string, pathname: string, search: string, end?: boolean) {
  const [path, query] = to.split('?')
  if (end) return pathname === path
  if (path === '/fleet') {
    const tab = new URLSearchParams(query).get('tab')
    const current = new URLSearchParams(search).get('tab') || 'trucks'
    return pathname === '/fleet' && (!tab || current === tab || (tab === 'trucks' && current === 'trailers'))
  }
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

export default function Layout() {
  const { user, signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const role = appRole(user?.role)
  const [notes, setNotes] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState('')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [mobileNav, setMobileNav] = useState(false)
  const [closedGroups, setClosedGroups] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]')
    } catch {
      return []
    }
  })

  const groups = useMemo(
    () =>
      NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.roles.includes(role)),
      })).filter((group) => group.items.length),
    [role],
  )

  async function refreshNotes() {
    setNotes(await listNotifications())
  }

  useEffect(() => {
    refreshNotes().catch(() => undefined)
    const timer = window.setInterval(() => {
      refreshNotes().catch(() => undefined)
    }, 12000)
    return () => window.clearInterval(timer)
  }, [user?.id])

  useEffect(() => {
    setMobileNav(false)
  }, [location.pathname, location.search])

  const unread = notes.filter((n) => !n.read).length
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  async function openNote(note: AppNotification) {
    if (!note.read) {
      await markNotificationRead(note.id).catch(() => undefined)
      await refreshNotes()
    }
    setOpen(false)
    if (note.load_id) navigate(`/loads/${note.load_id}`)
  }

  async function openAs(email: string, password: string, label: string, to: string) {
    setSwitching(label)
    try {
      await signIn(email, password)
      navigate(to)
    } finally {
      setSwitching('')
    }
  }

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
  }

  function toggleGroup(label: string) {
    setClosedGroups((rows) => {
      const next = rows.includes(label) ? rows.filter((item) => item !== label) : [...rows, label]
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}${mobileNav ? ' nav-open' : ''}`}>
      <div className="nav-backdrop" onClick={() => setMobileNav(false)} />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">MX</span>
          <div>
            <strong>MizigoX</strong>
            <span className="brand-view">{roleLabel(user?.role)}</span>
          </div>
          <button type="button" className="ghost menu-btn sidebar-close" aria-label="Close menu" onClick={() => setMobileNav(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="Main">
          {groups.map((group) => (
            <div key={group.label} className="nav-group">
              <button
                type="button"
                className="nav-label"
                aria-expanded={!closedGroups.includes(group.label)}
                onClick={() => toggleGroup(group.label)}
              >
                {role === 'customer' && group.label === 'Operations'
                  ? 'My freight'
                  : role === 'carrier' && group.label === 'Operations'
                    ? 'Jobs'
                    : role === 'driver' && group.label === 'Operations'
                      ? 'My trip'
                      : group.label}
              </button>
              {collapsed || !closedGroups.includes(group.label)
                ? group.items.map((link) => {
                    const active = isLinkActive(link.to, location.pathname, location.search, link.end)
                    return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    className={active ? 'active' : undefined}
                    title={link.label}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon name={link.icon} />
                    <span>{link.label}</span>
                  </NavLink>
                    )
                  })
                : null}
            </div>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-profile">
            <strong>{user?.name}</strong>
            <span>{roleLabel(user?.role)}</span>
          </div>
          <p className="sidebar-switch-label">Open as</p>
          <div className="role-switch">
            {DEMOS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                className={user?.email === demo.email ? 'ghost active' : 'ghost'}
                disabled={Boolean(switching)}
                onClick={() =>
                  openAs(
                    demo.email,
                    demo.password,
                    demo.label,
                    demo.key === 'admin' ? '/dispatch' : demo.key === 'transporter' ? '/transporters' : '/',
                  )
                }
              >
                {switching === demo.label ? '…' : demo.label}
              </button>
            ))}
          </div>
          <button type="button" className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="ghost menu-btn"
              aria-label="Open menu"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav((v) => !v)}
            >
              <Icon name="menu" />
            </button>
            <button type="button" className="ghost collapse-btn" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleCollapsed}>
              <Icon name="chevron" />
            </button>
            <span className="topbar-live">Live</span>
            <span className="topbar-date">{today}</span>
          </div>
          <GlobalSearch />
          <div className="topbar-right">
            <PwaInstall />
            <div className="notify-wrap">
              <button
                type="button"
                className="ghost notify-btn"
                aria-expanded={open}
                aria-label={unread ? `${unread} unread alerts` : 'Alerts'}
                onClick={() => setOpen((v) => !v)}
              >
                <Icon name="bell" />
                <span className="notify-label">Alerts</span>
                {unread ? <span className="count-pill">{unread}</span> : null}
              </button>
              {open ? (
                <div className="notify-panel">
                  <div className="panel-head">
                    <h2>Notifications</h2>
                    {unread ? (
                      <button type="button" className="ghost" onClick={() => markAllNotificationsRead().then(refreshNotes)}>
                        Mark all read
                      </button>
                    ) : null}
                  </div>
                  {notes.length === 0 ? <p className="muted">No alerts yet.</p> : null}
                  <ul className="notify-list">
                    {notes.map((note) => (
                      <li key={note.id} className={note.read ? '' : 'unread'}>
                        <button type="button" className="ghost notify-item" onClick={() => openNote(note)}>
                          <span className="notify-kind">{notificationKindLabel(note.kind)}</span>
                          <strong>{note.title}</strong>
                          <span>{note.message}</span>
                          <em>{fromNow(note.created_at) || formatWhen(note.created_at)}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="topbar-profile" title={user?.email}>
              <span className="topbar-avatar" aria-hidden="true">
                {(user?.name || 'U').slice(0, 1)}
              </span>
              <span className="topbar-user">
                <strong>{user?.name}</strong>
                <em>{roleLabel(user?.role)}</em>
              </span>
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
