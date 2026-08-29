import type { OrganizationType, RoleCode } from '@mizigox/shared';

export interface AuthContext {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  orgId: string;
  orgName: string;
  orgType: OrganizationType;
  role: RoleCode;
  permissions: string[];
  countryCode: string;
  currencyCode: string;
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
  orgId: string;
  orgType: OrganizationType;
  orgName: string;
  role: RoleCode;
  permissions: string[];
  countryCode: string;
  currencyCode: string;
  firstName: string;
  lastName: string;
  jti: string;
}
