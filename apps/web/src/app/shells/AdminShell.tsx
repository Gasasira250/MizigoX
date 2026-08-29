import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';

const upcoming = [
  { label: 'Shipments', phase: 'Later' },
  { label: 'Customers', phase: 'Later' },
  { label: 'Vehicles', phase: 'Later' },
  { label: 'Drivers', phase: 'Later' },
  { label: 'Routes', phase: 'Later' },
  { label: 'Tracking', phase: 'Later' },
  { label: 'Invoices', phase: 'Later' },
];

export function AdminShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <p className="text-lg font-semibold tracking-tight text-[#12355b]">MizigoX</p>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Freight & Logistics</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <p className="font-medium">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-slate-500">{user?.role.replaceAll('_', ' ')}</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => {
              void logout();
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside className="border-r border-slate-200 bg-white p-4">
          <nav className="flex flex-col gap-1">
            <NavLink
              to="/admin"
              className="rounded-md bg-[#12355b] px-3 py-2 text-sm font-medium text-white"
            >
              Foundation
            </NavLink>
            {upcoming.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-slate-400"
              >
                <span>{item.label}</span>
                <span className="text-[10px] uppercase tracking-wide">{item.phase}</span>
              </div>
            ))}
          </nav>
        </aside>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
