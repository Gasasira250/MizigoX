import type { Customer, Dashboard, Document, Driver, Load, LoadPayload, Trailer, Truck, User } from './types'

const API = 'http://127.0.0.1:8000'

function errorMessage(detail: unknown, fallback: string) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg ?? JSON.stringify(item)).join(', ')
  }
  return fallback
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers = new Headers(options.headers)
  const isForm = options.body instanceof FormData
  if (!isForm && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API}${path}`, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem('token')
    const loginPath = `${import.meta.env.BASE_URL}login`.replace(/\/{2,}/g, '/')
    if (!window.location.pathname.endsWith('/login')) {
      window.location.href = loginPath
    }
    throw new Error('Session expired. Sign in again.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errorMessage(body.detail, res.statusText))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function login(email: string, password: string) {
  const body = new URLSearchParams()
  body.set('username', email)
  body.set('password', password)
  return api<{ access_token: string }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

export function register(payload: { email: string; password: string; name: string; role: string; phone?: string }) {
  return api<{ access_token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const me = () => api<User>('/auth/me')
export const getDashboard = () => api<Dashboard>('/dashboard')
export const listCustomers = () => api<Customer[]>('/customers')
export const createCustomer = (payload: Omit<Customer, 'id'>) =>
  api<Customer>('/customers', { method: 'POST', body: JSON.stringify(payload) })
export const updateCustomer = (id: number, payload: Partial<Customer>) =>
  api<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const listDrivers = () => api<Driver[]>('/fleet/drivers')
export const createDriver = (payload: Omit<Driver, 'id'>) =>
  api<Driver>('/fleet/drivers', { method: 'POST', body: JSON.stringify(payload) })
export const updateDriver = (id: number, payload: Partial<Driver>) =>
  api<Driver>(`/fleet/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const listTrucks = () => api<Truck[]>('/fleet/trucks')
export const createTruck = (payload: Omit<Truck, 'id'>) =>
  api<Truck>('/fleet/trucks', { method: 'POST', body: JSON.stringify(payload) })
export const updateTruck = (id: number, payload: Partial<Truck>) =>
  api<Truck>(`/fleet/trucks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const listTrailers = () => api<Trailer[]>('/fleet/trailers')
export const createTrailer = (payload: Omit<Trailer, 'id'>) =>
  api<Trailer>('/fleet/trailers', { method: 'POST', body: JSON.stringify(payload) })
export const updateTrailer = (id: number, payload: Partial<Trailer>) =>
  api<Trailer>(`/fleet/trailers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const listLoads = (params?: { status?: string; q?: string }) => {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs}` : ''
  return api<Load[]>(`/loads${suffix}`)
}
export const getLoad = (id: number) => api<Load>(`/loads/${id}`)
export const createLoad = (payload: LoadPayload) =>
  api<Load>('/loads', { method: 'POST', body: JSON.stringify(payload) })
export const updateLoad = (id: number, payload: Partial<LoadPayload>) =>
  api<Load>(`/loads/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const assignLoad = (
  id: number,
  payload: { driver_id: number; truck_id: number; trailer_id?: number | null },
) => api<Load>(`/loads/${id}/assign`, { method: 'POST', body: JSON.stringify(payload) })
export const updateLoadStatus = (id: number, status: string, note = '') =>
  api<Load>(`/loads/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) })

export async function uploadDocument(loadId: number, file: File, docType: string) {
  const body = new FormData()
  body.append('file', file)
  body.append('doc_type', docType)
  return api<Document>(`/loads/${loadId}/documents`, { method: 'POST', body })
}

export async function downloadDocument(loadId: number, docId: number, filename: string) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API}/loads/${loadId}/documents/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('File is not available to download')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
