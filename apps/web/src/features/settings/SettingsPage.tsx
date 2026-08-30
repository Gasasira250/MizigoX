import type { OrganizationSettingsPayload } from '@mizigox/shared';
import { canManageOrgSettings } from '@mizigox/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPatch } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { useAuth } from '../../shared/auth/AuthProvider';
import { ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';
import { useToast } from '../../shared/ui/ToastProvider';
import { NotificationPreferencesPage } from '../notifications/NotificationPreferencesPage';

export function SettingsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const canOrg = canManageOrgSettings(user?.permissions);
  const [org, setOrg] = useState<OrganizationSettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !canOrg) return;
    void apiGet<OrganizationSettingsPayload>(`/organizations/${user.organization.id}`)
      .then(setOrg)
      .catch((cause) => setError(formatAppError(cause, 'Unable to load organization settings')));
  }, [user, canOrg]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!org || !user) return;
    const form = new FormData(event.currentTarget);
    try {
      const next = await apiPatch<OrganizationSettingsPayload>(
        `/organizations/${user.organization.id}`,
        {
          name: String(form.get('name') ?? org.name),
          legalName: String(form.get('legalName') || '') || null,
          email: String(form.get('email') || '') || null,
          phoneE164: String(form.get('phoneE164') || '') || null,
          timezone: String(form.get('timezone') || org.timezone),
          address: String(form.get('address') || '') || null,
          businessDetails: String(form.get('businessDetails') || '') || null,
        },
      );
      setOrg(next);
      notify('Organization settings saved');
    } catch (cause) {
      notify(formatAppError(cause, 'Unable to save settings'), 'error');
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Account security, notification preferences, and organization configuration."
      />
      <section>
        <h2 className="mb-3 text-sm font-semibold text-[#12355b]">User settings</h2>
        <div className="space-y-4">
          <Link
            className="text-sm text-[#12355b] hover:underline"
            to={
              user?.role === 'DRIVER'
                ? '/driver/profile'
                : user?.organization.type === 'CUSTOMER'
                  ? '/portal/account'
                  : '/admin/profile'
            }
          >
            Open full profile
          </Link>
          <NotificationPreferencesPage />
        </div>
      </section>
      {canOrg ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-[#12355b]">Organization settings</h2>
          {error ? <ErrorState message={error} /> : null}
          {!org ? (
            <LoadingState />
          ) : (
            <form
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
              onSubmit={(event) => void onSubmit(event)}
            >
              <label className="block text-sm font-medium">
                Organization name
                <input
                  name="name"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  defaultValue={org.name}
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Legal name
                <input
                  name="legalName"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  defaultValue={org.legalName ?? ''}
                />
              </label>
              <label className="block text-sm font-medium">
                Contact email
                <input
                  name="email"
                  type="email"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  defaultValue={org.email ?? ''}
                />
              </label>
              <label className="block text-sm font-medium">
                Phone
                <input
                  name="phoneE164"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  defaultValue={org.phoneE164 ?? ''}
                />
              </label>
              <p className="text-sm text-slate-600">
                Country {org.countryCode} · Currency {org.defaultCurrencyCode}
              </p>
              <label className="block text-sm font-medium">
                Time zone
                <input
                  name="timezone"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  defaultValue={org.timezone}
                />
              </label>
              <label className="block text-sm font-medium">
                Address
                <textarea
                  name="address"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  defaultValue={org.address ?? ''}
                />
              </label>
              <label className="block text-sm font-medium">
                Business details
                <textarea
                  name="businessDetails"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  defaultValue={org.businessDetails ?? ''}
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-[#12355b] px-4 py-2 text-sm text-white"
              >
                Save organization
              </button>
            </form>
          )}
        </section>
      ) : (
        <p className="text-sm text-slate-500">
          You can update your own profile and notification preferences. Organization-wide settings
          require authorization.
        </p>
      )}
    </div>
  );
}
