import { can, canAll, canAny } from '@mizigox/shared';
import { useAuth } from './AuthProvider';

export function useCan() {
  const { user } = useAuth();
  const permissions = user?.permissions;
  return {
    can: (permission: string) => can(permissions, permission),
    canAny: (...permissionsNeeded: string[]) => canAny(permissions, ...permissionsNeeded),
    canAll: (...permissionsNeeded: string[]) => canAll(permissions, ...permissionsNeeded),
  };
}

export { can, canAll, canAny };
