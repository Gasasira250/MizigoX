import type { PermissionCode, SessionUser } from '@mizigox/shared';
import { canAny } from '@mizigox/shared';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  end?: boolean;
  anyOf: string[];
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export function navigationFor(user: SessionUser | null): NavSection[] {
  if (!user) {
    return [];
  }
  const permissions = user.permissions;
  const isDriver = user.role === 'DRIVER';
  const isCustomer = user.organization.type === 'CUSTOMER';

  const sections: NavSection[] = isDriver
    ? [
        {
          id: 'driver',
          label: 'Driver',
          items: [
            { id: 'dashboard', label: 'Dashboard', to: '/driver', end: true, anyOf: [] },
            { id: 'trips', label: 'My trips', to: '/driver/trips', anyOf: [] },
            { id: 'tracking', label: 'Tracking', to: '/driver/tracking', anyOf: ['tracking.submit_location'] },
            { id: 'notifications', label: 'Notifications', to: '/driver/notifications', anyOf: ['notifications.read'] },
          ],
        },
      ]
    : isCustomer
      ? [
          {
            id: 'customer',
            label: 'Customer',
            items: [
              { id: 'dashboard', label: 'Dashboard', to: '/portal', end: true, anyOf: [] },
              { id: 'shipments', label: 'Shipments', to: '/portal/shipments', anyOf: ['shipments.read'] },
              { id: 'invoices', label: 'Invoices', to: '/portal/invoices', anyOf: ['invoices.read'] },
              {
                id: 'notifications',
                label: 'Notifications',
                to: '/portal/notifications',
                anyOf: ['notifications.read'],
              },
              { id: 'profile', label: 'Company', to: '/portal/profile', anyOf: [] },
            ],
          },
        ]
      : [
          {
            id: 'overview',
            label: 'Overview',
            items: [
              {
                id: 'dashboard',
                label: 'Dashboard',
                to: '/admin',
                end: true,
                anyOf: ['dashboard.operations'],
              },
              {
                id: 'finance-dashboard',
                label: 'Finance',
                to: '/admin/finance',
                anyOf: ['dashboard.finance', 'finance.read'],
              },
            ],
          },
          {
            id: 'operations',
            label: 'Operations',
            items: [
              { id: 'shipments', label: 'Shipments', to: '/admin/shipments', anyOf: ['shipments.read'] },
              { id: 'routes', label: 'Routes', to: '/admin/routes', anyOf: ['routes.read'] },
              { id: 'dispatch', label: 'Dispatch', to: '/admin/dispatch', anyOf: ['dispatch.read', 'routes.read'] },
              { id: 'tracking', label: 'Tracking', to: '/admin/tracking', anyOf: ['tracking.read'] },
            ],
          },
          {
            id: 'transport',
            label: 'Transport',
            items: [
              { id: 'vehicles', label: 'Vehicles', to: '/admin/vehicles', anyOf: ['vehicles.read'] },
              { id: 'drivers', label: 'Drivers', to: '/admin/drivers', anyOf: ['drivers.read'] },
            ],
          },
          {
            id: 'customers',
            label: 'Customers',
            items: [{ id: 'customers', label: 'Customers', to: '/admin/customers', anyOf: ['customers.read'] }],
          },
          {
            id: 'finance',
            label: 'Finance',
            items: [
              { id: 'invoices', label: 'Invoices', to: '/admin/invoices', anyOf: ['invoices.read'] },
              { id: 'payments', label: 'Payments', to: '/admin/payments', anyOf: ['payments.read'] },
            ],
          },
          {
            id: 'communication',
            label: 'Communication',
            items: [
              {
                id: 'notifications',
                label: 'Notifications',
                to: '/admin/notifications',
                anyOf: ['notifications.read'],
              },
            ],
          },
          {
            id: 'administration',
            label: 'Administration',
            items: [
              { id: 'users', label: 'Users', to: '/admin/users', anyOf: ['users.read', 'users.manage'] },
              { id: 'organizations', label: 'Organizations', to: '/admin/organizations', anyOf: ['org.settings'] },
              { id: 'roles', label: 'Roles & permissions', to: '/admin/roles', anyOf: ['users.manage'] },
              { id: 'settings', label: 'Settings', to: '/admin/settings', anyOf: [] },
              { id: 'audit', label: 'Audit logs', to: '/admin/audit', anyOf: ['audit.read'] },
            ],
          },
        ];

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.anyOf.length === 0 || canAny(permissions, ...item.anyOf)),
    }))
    .filter((section) => section.items.length > 0);
}

export function notificationsPathFor(user: SessionUser | null) {
  if (!user) return '/login';
  if (user.role === 'DRIVER') return '/driver/notifications';
  if (user.organization.type === 'CUSTOMER') return '/portal/notifications';
  return '/admin/notifications';
}

export function profilePathFor(user: SessionUser | null) {
  if (!user) return '/login';
  if (user.role === 'DRIVER') return '/driver/profile';
  if (user.organization.type === 'CUSTOMER') return '/portal/account';
  return '/admin/profile';
}

export type { PermissionCode };
