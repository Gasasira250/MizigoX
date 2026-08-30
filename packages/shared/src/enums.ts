export const ORGANIZATION_TYPES = ['PLATFORM', 'OPERATOR', 'CUSTOMER'] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const USER_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ROLE_SCOPES = ['PLATFORM', 'OPERATOR', 'CUSTOMER'] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

export const ROLE_CODES = [
  'SUPER_ADMIN',
  'OPERATIONS_ADMIN',
  'FINANCE_ADMIN',
  'COMPANY_ADMIN',
  'LOGISTICS_MANAGER',
  'FINANCE_OFFICER',
  'DRIVER',
  'CUSTOMER_ADMIN',
  'CUSTOMER_USER',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'INVITED', 'REVOKED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'sw', 'rw'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
