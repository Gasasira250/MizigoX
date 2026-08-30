import {
  canReadCustomers,
  canReadDispatch,
  canReadDrivers,
  canReadRoutes,
  canReadShipments,
  canReadVehicles,
  canReadTracking,
  canViewLiveTracking,
  canReadInvoices,
  canReadPayments,
} from '@mizigox/shared';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';

export function AdminShell() {
  const { user, logout } = useAuth();
  const canCustomers = canReadCustomers(user?.permissions);
  const canShipments = canReadShipments(user?.permissions);
  const canVehicles = canReadVehicles(user?.permissions);
  const canDrivers = canReadDrivers(user?.permissions);
  const canRoutes = canReadRoutes(user?.permissions);
  const canDispatch = canReadDispatch(user?.permissions);
  const canTracking = canReadTracking(user?.permissions);
  const canLive = canViewLiveTracking(user?.permissions);
  const canInvoices = canReadInvoices(user?.permissions);
  const canPayments = canReadPayments(user?.permissions);

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
              end
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              Foundation
            </NavLink>
            {canCustomers ? (
              <NavLink
                to="/admin/customers"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Customers
              </NavLink>
            ) : null}
            {canShipments ? (
              <NavLink
                to="/admin/shipments"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Shipments
              </NavLink>
            ) : null}
            {canVehicles ? (
              <NavLink
                to="/admin/vehicles"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Vehicles
              </NavLink>
            ) : null}
            {canDrivers ? (
              <NavLink
                to="/admin/drivers"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Drivers
              </NavLink>
            ) : null}
            {canRoutes ? (
              <NavLink
                to="/admin/routes"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Routes
              </NavLink>
            ) : null}
            {canDispatch ? (
              <NavLink
                to="/admin/dispatch"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Dispatch
              </NavLink>
            ) : null}
            {canTracking ? (
              <NavLink
                to="/admin/tracking"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Tracking
              </NavLink>
            ) : null}
            {canLive ? (
              <NavLink
                to="/admin/tracking/live"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Live Tracking
              </NavLink>
            ) : null}
            {canInvoices ? (
              <NavLink
                to="/admin/invoices"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Invoices
              </NavLink>
            ) : null}
            {canPayments ? (
              <NavLink
                to="/admin/payments"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-[#12355b] text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Payments
              </NavLink>
            ) : null}
          </nav>
        </aside>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
