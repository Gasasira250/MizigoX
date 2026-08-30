import type { SessionUser } from '@mizigox/shared';
import { canReadFinanceDashboard, canReadOperationsDashboard } from '@mizigox/shared';

export function homePathFor(user: SessionUser | null) {
  if (!user) {
    return '/login';
  }

  if (user.role === 'DRIVER') {
    return '/driver';
  }

  if (user.organization.type === 'CUSTOMER') {
    return '/portal';
  }

  if (!canReadOperationsDashboard(user.permissions) && canReadFinanceDashboard(user.permissions)) {
    return '/admin/finance';
  }

  return '/admin';
}
