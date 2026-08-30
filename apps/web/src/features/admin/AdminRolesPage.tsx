import type { RoleOption } from '@mizigox/shared';
import { ROLE_DEFINITIONS, ROLE_PERMISSIONS, type RoleCode } from '@mizigox/shared';
import { useEffect, useState } from 'react';
import { apiGet } from '../../shared/api/client';
import { formatAppError } from '../../shared/api/errors';
import { ErrorState, LoadingState, PageHeader } from '../../shared/ui/Dashboard';

export function AdminRolesPage() {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<RoleOption[]>('/roles')
      .then(setRoles)
      .catch((cause) => setError(formatAppError(cause, 'Unable to load roles')));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (roles.length === 0) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & permissions"
        description="System roles are defined centrally. Assignments are managed from Users."
      />
      {roles.map((role) => {
        const code = role.code as RoleCode;
        const definition = ROLE_DEFINITIONS[code];
        const permissions = ROLE_PERMISSIONS[code] ?? [];
        return (
          <section key={role.code} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-[#12355b]">{role.name}</h2>
            <p className="text-sm text-slate-600">{definition?.description ?? role.scope}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {permissions.map((permission) => (
                <span key={permission} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                  {permission}
                </span>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
