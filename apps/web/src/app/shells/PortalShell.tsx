import { canReadInvoices, canReadNotifications } from '@mizigox/shared';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
import { NotificationBell } from '../../features/notifications/NotificationBell';

export function PortalShell({ title }: { title: string }) {
  const { user, logout } = useAuth();
  const historyPath = title === 'Driver portal' ? '/driver/notifications' : '/portal/notifications';

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <p className="text-lg font-semibold text-[#12355b]">MizigoX</p>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {title === 'Customer portal' ? (
            <>
              <NavLink className="text-slate-700 hover:underline" to="/portal/shipments">
                Shipments
              </NavLink>
              {canReadInvoices(user?.permissions) ? (
                <NavLink className="text-slate-700 hover:underline" to="/portal/invoices">
                  Invoices
                </NavLink>
              ) : null}
              {canReadNotifications(user?.permissions) ? (
                <NavLink className="text-slate-700 hover:underline" to="/portal/notifications">
                  Notifications
                </NavLink>
              ) : null}
            </>
          ) : null}
          {title === 'Driver portal' ? (
            <>
              <NavLink className="text-slate-700 hover:underline" to="/driver">
                Tracking
              </NavLink>
              {canReadNotifications(user?.permissions) ? (
                <NavLink className="text-slate-700 hover:underline" to="/driver/notifications">
                  Notifications
                </NavLink>
              ) : null}
            </>
          ) : null}
          {canReadNotifications(user?.permissions) ? (
            <NotificationBell historyPath={historyPath} />
          ) : null}
          <span className="text-slate-600">
            {user?.firstName} {user?.lastName}
          </span>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
            onClick={() => {
              void logout();
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
