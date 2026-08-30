import { ApiError } from './client';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Please check the highlighted fields and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'We could not find that record.',
  409: 'This record was already updated. Refresh and try again.',
  422: 'Please check the highlighted fields and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong. Please try again.',
};

export function formatAppError(error: unknown, fallback: string): string {
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return 'Network error. Check your connection and retry.';
  }
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : fallback;
  }
  if (error.status === 401) {
    return STATUS_MESSAGES[401] ?? 'Your session has expired. Please sign in again.';
  }
  const issues = error.details
    .map((detail) => {
      if (detail && typeof detail === 'object' && 'message' in detail) {
        return String((detail as { message: string }).message);
      }
      return null;
    })
    .filter((message): message is string => Boolean(message));
  if (issues.length > 0 && (error.status === 400 || error.status === 422)) {
    return `${error.message}: ${issues.slice(0, 3).join(' ')}`;
  }
  if (error.message && error.message !== 'Request failed') {
    return error.message;
  }
  return STATUS_MESSAGES[error.status] ?? fallback;
}

export function errorTone(error: unknown): 'error' | 'warning' {
  if (error instanceof ApiError && (error.status === 409 || error.status === 429)) {
    return 'warning';
  }
  return 'error';
}
