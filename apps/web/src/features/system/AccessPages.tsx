import { Link } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
import { homePathFor } from '../../shared/auth/home-path';

export function ForbiddenPage() {
  const { user } = useAuth();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8">
      <h1 className="text-2xl font-semibold text-[#12355b]">You do not have access</h1>
      <p className="mt-2 text-sm text-slate-600">
        This page is not available for your role. If you think this is a mistake, ask an
        administrator.
      </p>
      <Link
        className="mt-4 inline-block text-sm font-medium text-teal-800 hover:underline"
        to={homePathFor(user)}
      >
        Back to home
      </Link>
    </section>
  );
}

export function NotFoundPage() {
  const { user } = useAuth();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8">
      <h1 className="text-2xl font-semibold text-[#12355b]">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">That URL does not match a MizigoX page.</p>
      <Link
        className="mt-4 inline-block text-sm font-medium text-teal-800 hover:underline"
        to={homePathFor(user)}
      >
        Back to home
      </Link>
    </section>
  );
}

export function UnauthorizedPage() {
  return (
    <section className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8">
      <h1 className="text-2xl font-semibold text-[#12355b]">Sign in required</h1>
      <p className="mt-2 text-sm text-slate-600">Your session expired or you are not signed in.</p>
      <Link
        className="mt-4 inline-block rounded-md bg-[#12355b] px-4 py-2 text-sm text-white"
        to="/login"
      >
        Sign in
      </Link>
    </section>
  );
}
