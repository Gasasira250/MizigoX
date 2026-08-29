export interface ApiSuccess<T> {
  data: T;
  meta: {
    requestId: string;
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown[];
    requestId: string;
  };
}

export interface HealthPayload {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}

export interface ReadinessCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  message?: string;
}

export interface ReadinessPayload {
  status: 'ok' | 'error';
  checks: {
    database: ReadinessCheck;
  };
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
  organization: {
    id: string;
    name: string;
    type: string;
    countryCode: string;
    defaultCurrencyCode: string;
  };
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: SessionUser;
}
