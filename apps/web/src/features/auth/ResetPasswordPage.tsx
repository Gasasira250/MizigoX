import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiPost } from '../../shared/api/client';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/auth/reset-password', { token, newPassword: password });
      navigate('/login', { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to reset password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">MizigoX</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#12355b]">Choose a new password</h1>
        {!token ? (
          <p className="mt-4 text-sm text-slate-600">
            This page needs a valid reset token from your email. Request a new reset from the
            sign-in page.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={(event) => void onSubmit(event)}>
            <label className="block text-sm font-medium text-slate-700">
              New password
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={12}
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirm password
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                minLength={12}
                required
              />
            </label>
            <p className="text-xs text-slate-500">
              Use at least 12 characters with a letter and a number.
            </p>
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
              {submitting ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
        <p className="mt-6 text-sm text-slate-600">
          <Link className="font-medium text-teal-800 hover:underline" to="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
