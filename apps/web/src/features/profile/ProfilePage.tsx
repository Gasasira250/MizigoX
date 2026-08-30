import type { UserProfilePayload } from '@mizigox/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { ChangePasswordPanel } from '../auth/ChangePasswordPanel';
import { apiGet, apiPatch } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';
import { StatusBadge } from '../../shared/ui/StatusBadge';
import { useToast } from '../../shared/ui/ToastProvider';

export function ProfilePage() {
  const { notify } = useToast();
  const [profile, setProfile] = useState<UserProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState('en');
  const [timezone, setTimezone] = useState('Africa/Kigali');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  useEffect(() => {
    void apiGet<UserProfilePayload>('/me/profile')
      .then((next) => {
        setProfile(next);
        setFirstName(next.firstName);
        setLastName(next.lastName);
        setPhone(next.phoneE164 ?? '');
        setLanguage(next.preferredLanguage);
        setTimezone(next.preferredTimezone);
        setDensity(next.displayPreferences.density);
      })
      .catch((cause) => setError(formatAppError(cause, 'Unable to load profile')));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const next = await apiPatch<UserProfilePayload>('/me/profile', {
        firstName,
        lastName,
        phoneE164: phone || null,
        preferredLanguage: language,
        preferredTimezone: timezone,
        displayPreferences: { density, language, timezone },
      });
      setProfile(next);
      notify('Profile updated');
    } catch (cause) {
      notify(formatAppError(cause, 'Unable to update profile'), 'error');
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!profile) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="You can update personal details. Role and organization cannot be changed here."
      />
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p>
          {profile.role.replaceAll('_', ' ')} · {profile.organization.name}
        </p>
        <div className="mt-2">
          <StatusBadge status={profile.status} />
        </div>
      </section>
      <form
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        onSubmit={(event) => void onSubmit(event)}
      >
        <label className="block text-sm font-medium">
          First name
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Last name
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2"
            value={profile.email}
            disabled
          />
        </label>
        <label className="block text-sm font-medium">
          Phone
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Language
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Time zone
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Display density
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={density}
            onChange={(e) => setDensity(e.target.value as 'comfortable' | 'compact')}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <button type="submit" className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white">
          Save profile
        </button>
      </form>
      <ChangePasswordPanel />
    </div>
  );
}
