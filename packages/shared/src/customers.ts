export const CUSTOMER_TYPES = ['BUSINESS', 'INDIVIDUAL', 'GOVERNMENT', 'NGO', 'OTHER'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_LIFECYCLE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CustomerLifecycleStatus = (typeof CUSTOMER_LIFECYCLE_STATUSES)[number];

export const CONTACT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const ADDRESS_TYPES = [
  'PICKUP',
  'DELIVERY',
  'BILLING',
  'OFFICE',
  'WAREHOUSE',
  'OTHER',
] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

export const CUSTOMER_SORT_FIELDS = [
  'name',
  'createdAt',
  'customerReference',
  'status',
  'city',
] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

export function customerStatusLabel(status: string) {
  if (status === 'ACTIVE') {
    return 'Active';
  }
  return 'Inactive';
}

export function customerTypeLabel(type: string) {
  switch (type) {
    case 'BUSINESS':
      return 'Business';
    case 'INDIVIDUAL':
      return 'Individual';
    case 'GOVERNMENT':
      return 'Government';
    case 'NGO':
      return 'NGO';
    default:
      return 'Other';
  }
}

export function addressTypeLabel(type: string) {
  switch (type) {
    case 'PICKUP':
      return 'Pickup';
    case 'DELIVERY':
      return 'Delivery';
    case 'BILLING':
      return 'Billing';
    case 'OFFICE':
      return 'Office';
    case 'WAREHOUSE':
      return 'Warehouse';
    default:
      return 'Other';
  }
}

export function hasAnyPermission(
  granted: readonly string[] | undefined,
  ...needed: readonly string[]
) {
  if (!granted?.length) {
    return false;
  }
  return needed.some((permission) => granted.includes(permission));
}

export function canReadCustomers(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'customers.manage', 'customers.read');
}

export function canCreateCustomers(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'customers.manage', 'customers.create');
}

export function canUpdateCustomers(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'customers.manage', 'customers.update');
}

export function canDeleteCustomers(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'customers.manage', 'customers.delete');
}
