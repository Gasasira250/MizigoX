import { trackingFreshnessLabel } from '@mizigox/shared';

export function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function formatAge(ageSeconds: number | null | undefined) {
  if (ageSeconds == null) {
    return 'No update';
  }
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }
  if (ageSeconds < 3600) {
    return `${Math.floor(ageSeconds / 60)}m ago`;
  }
  if (ageSeconds < 86_400) {
    return `${Math.floor(ageSeconds / 3600)}h ago`;
  }
  return `${Math.floor(ageSeconds / 86_400)}d ago`;
}

export function formatSpeed(speedKph: number | null | undefined) {
  if (speedKph == null) {
    return '—';
  }
  return `${speedKph.toFixed(1)} km/h`;
}

export function formatHeading(heading: number | null | undefined) {
  if (heading == null) {
    return '—';
  }
  return `${Math.round(heading)}°`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

export function freshnessCopy(state: string) {
  return trackingFreshnessLabel(state);
}

export function formatApiError(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return fallback;
}
