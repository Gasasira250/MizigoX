import { useState, type FormEvent } from 'react';
import { ApiError, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';

export function ChangePasswordPanel() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/auth/change-password', { currentPassword, newPassword });
      await logout();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to change password');
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">Change password</h2>
      <p className="mt-1 text-sm text-slate-500">
        Changing your password signs you out of every session.
      </p>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
        <label className="text-sm font-medium text-slate-700">
          Current password
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          New password
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={12}
          />
        </label>
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">{error}</p>
        ) : null}
        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  );
}
