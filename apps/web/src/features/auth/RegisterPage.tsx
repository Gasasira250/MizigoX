import type { InvitePreview } from '@mizigox/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiGet } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { homePathFor } from '../../shared/auth/home-path';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    apiGet<InvitePreview>(`/auth/invites/${token}`)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof ApiError ? cause.message : 'Invite is invalid or has expired');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await register({ token, firstName, lastName, password });
      navigate(homePathFor(user), { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to create your account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">MizigoX</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#12355b]">Create your account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Registration is invite-only. Accounts are created against a real organization membership.
        </p>

        {loading ? <p className="mt-6 text-sm text-slate-500">Checking invite…</p> : null}

        {!loading && !token ? (
          <p className="mt-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            An invitation link is required. Ask an administrator to invite you.
          </p>
        ) : null}

        {preview ? (
          <div className="mt-4 rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-700">
            <p>
              <strong>{preview.email}</strong> invited to {preview.organizationName}
            </p>
            <p className="mt-1 text-slate-500">Role: {preview.role.replaceAll('_', ' ')}</p>
          </div>
        ) : null}

        {preview ? (
          <form className="mt-6 space-y-4" onSubmit={(event) => void onSubmit(event)}>
            <label className="block text-sm font-medium text-slate-700">
              First name
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
                name="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Last name
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
                name="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
                type="password"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={12}
              />
            </label>
            <p className="text-xs text-slate-500">At least 12 characters, including a letter and a number.</p>

            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-md bg-[#12355b] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0d2743] disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        ) : null}

        {!loading && error && !preview ? (
          <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <p className="mt-6 text-sm text-slate-600">
          Already have an account?{' '}
          <Link className="font-medium text-teal-800 hover:underline" to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
