import {
  DRIVER_AVAILABILITIES,
  DRIVER_DOCUMENT_TYPES,
  DRIVER_STATUSES,
  FLEET_DOCUMENT_STATUSES,
  FUEL_TYPES,
  OWNERSHIP_TYPES,
  PAYLOAD_UNITS,
  VEHICLE_AVAILABILITIES,
  VEHICLE_DOCUMENT_TYPES,
  VEHICLE_STATUSES,
  documentTypeLabel,
  fleetStatusLabel,
  type DocumentAlertWindow,
  type FleetDocumentPayload,
} from '@mizigox/shared';
import { ApiError } from '../../shared/api/client';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function formatApiError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  const issues = error.details
    .map((detail) => {
      if (detail && typeof detail === 'object' && 'message' in detail) {
        return String((detail as { message: string }).message);
      }
      return null;
    })
    .filter((message): message is string => Boolean(message));
  if (issues.length > 0) {
    return `${error.message}: ${issues.slice(0, 3).join(' ')}`;
  }
  return error.message;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function statusOptions(statuses: readonly string[]) {
  return statuses.map((value) => ({ value, label: fleetStatusLabel(value) }));
}

export const vehicleStatusOptions = statusOptions(VEHICLE_STATUSES);
export const vehicleAvailabilityOptions = statusOptions(VEHICLE_AVAILABILITIES);
export const driverStatusOptions = statusOptions(DRIVER_STATUSES);
export const driverAvailabilityOptions = statusOptions(DRIVER_AVAILABILITIES);
export const fuelTypeOptions = statusOptions(FUEL_TYPES);
export const ownershipOptions = statusOptions(OWNERSHIP_TYPES);
export const payloadUnitOptions = PAYLOAD_UNITS.map((value) => ({ value, label: value }));
export const vehicleDocumentTypeOptions = VEHICLE_DOCUMENT_TYPES.map((value) => ({
  value,
  label: documentTypeLabel(value),
}));
export const driverDocumentTypeOptions = DRIVER_DOCUMENT_TYPES.map((value) => ({
  value,
  label: documentTypeLabel(value),
}));
export const documentStatusOptions = FLEET_DOCUMENT_STATUSES.map((value) => ({
  value,
  label: fleetStatusLabel(value),
}));

export const expiryWindowOptions: Array<{ value: DocumentAlertWindow; label: string }> = [
  { value: 'expired', label: 'Expired' },
  { value: 'today', label: 'Expire today' },
  { value: '7', label: 'Expire within 7 days' },
  { value: '30', label: 'Expire within 30 days' },
];

export function emptyDocumentForm(documentType: string) {
  return {
    documentType,
    documentNumber: '',
    issuedAt: '',
    expiresAt: '',
    status: 'VALID' as const,
    storageKey: '',
    fileUrl: '',
    notes: '',
  };
}

export type DocumentFormState = ReturnType<typeof emptyDocumentForm>;

export function documentFromPayload(document: FleetDocumentPayload): DocumentFormState {
  return {
    documentType: document.documentType,
    documentNumber: document.documentNumber ?? '',
    issuedAt: document.issuedAt ?? '',
    expiresAt: document.expiresAt ?? '',
    status: document.status,
    storageKey: document.storageKey ?? '',
    fileUrl: document.fileUrl ?? '',
    notes: document.notes ?? '',
  };
}

export function buildDocumentPayload(form: DocumentFormState) {
  return {
    documentType: form.documentType,
    documentNumber: form.documentNumber.trim() || undefined,
    issuedAt: form.issuedAt || undefined,
    expiresAt: form.expiresAt || undefined,
    status: form.status,
    storageKey: form.storageKey.trim() || undefined,
    fileUrl: form.fileUrl.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

export function validateDocumentForm(form: DocumentFormState) {
  const errors: string[] = [];
  if (!form.documentType) {
    errors.push('Document type is required.');
  }
  if (form.issuedAt && form.expiresAt && form.expiresAt < form.issuedAt) {
    errors.push('Expiry date cannot be before the issue date.');
  }
  if (form.fileUrl.trim() && !/^https?:\/\//i.test(form.fileUrl.trim())) {
    errors.push('File URL must be an http(s) reference to object storage.');
  }
  return errors;
}
