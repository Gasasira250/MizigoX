import type { ApiErrorBody } from '@mizigox/shared';

function resolveApiBase() {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!raw) {
    return '/api/v1';
  }
  const trimmed = raw.replace(/\/$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

const API_BASE = resolveApiBase();

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details: unknown[];

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    details: unknown[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function parseBody(response: Response) {
  return (await response.json()) as {
    data?: unknown;
    meta?: { requestId?: string; page?: number; pageSize?: number; total?: number };
  } & Partial<ApiErrorBody>;
}

async function fetchApi(path: string, init: RequestInit) {
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: init.credentials ?? 'include',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach MizigoX. Check your connection.');
  }
}

async function request<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetchApi(path, { ...init, headers });

  if (
    response.status === 401 &&
    allowRefresh &&
    path !== '/auth/refresh' &&
    path !== '/auth/login'
  ) {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      return request<T>(path, init, false);
    }
    unauthorizedHandler?.();
  }

  const body = await parseBody(response).catch(() => ({
    error: { code: 'REQUEST_FAILED', message: 'Request failed', details: [], requestId: '' },
  }));
  if (!response.ok || body.error) {
    throw new ApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'Request failed',
      body.error?.requestId,
      body.error?.details ?? [],
    );
  }

  return body.data as T;
}

export async function apiGetWithMeta<T>(path: string) {
  const headers = new Headers();
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  const response = await fetchApi(path, { headers });
  if (response.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      return apiGetWithMeta<T>(path);
    }
  }
  const body = await parseBody(response).catch(() => ({
    error: { code: 'REQUEST_FAILED', message: 'Request failed', details: [], requestId: '' },
    data: undefined,
    meta: {},
  }));
  if (!response.ok || body.error) {
    throw new ApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'Request failed',
      body.error?.requestId,
      body.error?.details ?? [],
    );
  }
  return {
    data: body.data as T,
    meta: body.meta ?? {},
  };
}

export function apiGet<T>(path: string) {
  return request<T>(path);
}

export async function apiGetPublic<T>(path: string) {
  const response = await fetchApi(path, { credentials: 'omit' });
  const body = await parseBody(response).catch(() => ({
    error: { code: 'REQUEST_FAILED', message: 'Request failed', details: [], requestId: '' },
  }));
  if (!response.ok || body.error) {
    throw new ApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'Request failed',
      body.error?.requestId,
      body.error?.details ?? [],
    );
  }
  return body.data as T;
}

export function apiPost<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string) {
  return request<T>(path, { method: 'DELETE' });
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = request<{ accessToken: string }>('/auth/refresh', { method: 'POST' }, false)
      .then((data) => {
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}
