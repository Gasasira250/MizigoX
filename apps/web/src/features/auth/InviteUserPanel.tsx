import type { CreatedInvite, RoleOption } from '@mizigox/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, apiGet, apiPost } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';

interface OrganizationOption {
  id: string;
  name: string;
  type: string;
}

export function InviteUserPanel() {
  const { user } = useAuth();
  const canInvite = user?.permissions.includes('users.manage');
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [organizationId, setOrganizationId] = useState(user?.organization.id ?? '');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!canInvite) {
      return;
    }

    let cancelled = false;
    Promise.all([apiGet<OrganizationOption[]>('/organizations'), apiGet<RoleOption[]>('/roles')])
      .then(([orgs, roleOptions]) => {
        if (!cancelled) {
          setOrganizations(orgs);
          setRoles(roleOptions);
          setOrganizationId((current) => current || orgs[0]?.id || '');
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof ApiError ? cause.message : 'Unable to load invite options');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canInvite]);

  const selectedOrg = organizations.find((org) => org.id === organizationId);
  const availableRoles = useMemo(
    () => roles.filter((item) => !selectedOrg || item.scope === selectedOrg.type),
    [roles, selectedOrg],
  );

  if (!canInvite) {
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInvite(null);
    setSubmitting(true);
    try {
      const created = await apiPost<CreatedInvite>('/auth/invites', {
        email,
        role,
        organizationId,
      });
      setInvite(created);
      setEmail('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to create invite');
    } finally {
      setSubmitting(false);
    }
  }

  const inviteUrl = invite ? `${window.location.origin}/register?token=${invite.token}` : '';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">Invite a user</h2>
      <p className="mt-1 text-sm text-slate-500">
        Invite-only registration. The token is shown once so you can share the link until email
        delivery is added.
      </p>

      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
        <label className="text-sm font-medium text-slate-700">
          Organization
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={organizationId}
            onChange={(event) => {
              setOrganizationId(event.target.value);
              setRole('');
            }}
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.type})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Role
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            required
          >
            <option value="">Select a role</option>
            {availableRoles.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Email
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-[#12355b] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2743] disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Creating invite…' : 'Create invite'}
          </button>
        </div>
      </form>

      {inviteUrl ? (
        <p className="mt-4 break-all rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Invite link: {inviteUrl}
        </p>
      ) : null}
    </section>
  );
}
