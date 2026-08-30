import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { GlobalSearch } from '../../features/search/GlobalSearch';
import { useAuth } from '../../shared/auth/AuthProvider';
import { navigationFor, notificationsPathFor, profilePathFor } from '../nav';

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const sections = navigationFor(user);
  const historyPath = notificationsPathFor(user);
  const profilePath = profilePathFor(user);

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm md:hidden"
            aria-expanded={open}
            aria-controls="app-nav"
            onClick={() => setOpen((current) => !current)}
          >
            Menu
          </button>
          <div className="shrink-0">
            <p className="text-lg font-semibold tracking-tight text-[#12355b]">MizigoX</p>
            <p className="hidden text-xs uppercase tracking-[0.16em] text-slate-500 sm:block">
              Freight & Logistics
            </p>
          </div>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user?.permissions.includes('notifications.read') ? (
              <NotificationBell historyPath={historyPath} />
            ) : null}
            <button
              type="button"
              className="hidden text-right sm:block"
              onClick={() => navigate(profilePath)}
            >
              <p className="font-medium">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-500">{user?.role.replaceAll('_', ' ')}</p>
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => {
                void logout();
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl grid-cols-1 md:grid-cols-[220px_1fr]">
        <aside
          id="app-nav"
          className={`${open ? 'block' : 'hidden'} border-r border-slate-200 bg-white p-4 md:block`}
        >
          <nav className="flex flex-col gap-4" aria-label="Primary">
            {sections.map((section) => (
              <div key={section.id}>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {section.label}
                </p>
                <div className="mt-1 flex flex-col gap-1">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      end={item.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `rounded-md px-3 py-2 text-sm font-medium ${
                          isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <main id="main-content" className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
