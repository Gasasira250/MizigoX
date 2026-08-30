import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiPost } from '../../shared/api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to submit that request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">MizigoX</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#12355b]">Reset password</h1>
        {submitted ? (
          <p className="mt-4 text-sm text-slate-600">
            If an account exists for that email, a reset link will be sent when email delivery is
            configured. Check with your administrator if you do not receive a message.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Enter the email on your MizigoX account. For security, the response is the same
              whether or not the account exists.
            </p>
            <form className="mt-6 space-y-4" onSubmit={(event) => void onSubmit(event)}>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
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
                {submitting ? 'Submitting…' : 'Send reset instructions'}
              </button>
            </form>
          </>
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
