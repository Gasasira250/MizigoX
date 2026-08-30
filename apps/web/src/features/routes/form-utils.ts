import {
  ROUTE_STATUSES,
  ROUTE_STOP_TYPES,
  ROUTE_TYPES,
  routeStatusLabel,
  routeStopTypeLabel,
  routeTypeLabel,
} from '@mizigox/shared';
import { ApiError } from '../../shared/api/client';

export function formatApiError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  const issues = error.details
    .map((detail) => {
      if (typeof detail === 'string') {
        return detail;
      }
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
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toLocalInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function toIsoDateTime(value: string) {
  if (!value.trim()) {
    return undefined;
  }
  return new Date(value).toISOString();
}

export function formatDuration(minutes: number | null | undefined) {
  if (minutes == null) {
    return '—';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export function formatKg(value: number | null | undefined) {
  if (value == null) {
    return '—';
  }
  return `${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })} kg`;
}

export function routeStatusOptions() {
  return ROUTE_STATUSES.map((value) => ({ value, label: routeStatusLabel(value) }));
}

export function routeTypeOptions() {
  return ROUTE_TYPES.map((value) => ({ value, label: routeTypeLabel(value) }));
}

export function stopTypeOptions() {
  return ROUTE_STOP_TYPES.map((value) => ({ value, label: routeStopTypeLabel(value) }));
}

export function capacityWarning(cargoKg: number, capacityKg: number | null | undefined) {
  if (capacityKg == null) {
    return cargoKg > 0 ? 'Selected vehicle has no recorded payload capacity.' : null;
  }
  if (cargoKg > capacityKg) {
    return `Cargo ${formatKg(cargoKg)} exceeds vehicle capacity ${formatKg(capacityKg)}.`;
  }
  return null;
}
