import { Outlet } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';

export function PortalShell({ title }: { title: string }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <p className="text-lg font-semibold text-[#12355b]">MizigoX</p>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
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
      <main className="mx-auto max-w-3xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
