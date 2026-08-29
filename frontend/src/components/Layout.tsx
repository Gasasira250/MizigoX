import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/loads', label: 'Loads' },
  { to: '/dispatch', label: 'Dispatch' },
  { to: '/fleet', label: 'Fleet' },
  { to: '/customers', label: 'Customers' },
]

export default function Layout() {
  const { user, signOut } = useAuth()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">MX</span>
          <div>
            <strong>Mizigox</strong>
            <span>Carrier TMS</span>
          </div>
        </div>
        <nav>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.role}</span>
          </div>
          <button type="button" className="ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
