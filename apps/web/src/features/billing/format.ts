import { ApiError } from '../../shared/api/client';

export function formatMoney(amount: string | null | undefined, currency = 'RWF') {
  if (!amount) {
    return `0.00 ${currency}`;
  }
  const negative = amount.startsWith('-');
  const raw = negative ? amount.slice(1) : amount;
  const [whole = '0', fraction = '00'] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${fraction.padEnd(2, '0').slice(0, 2)} ${currency}`;
}

export function formatDateOnly(value: string | null | undefined) {
  if (!value) {
    return '—';
  }
  const date = value.length <= 10 ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
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

export function paymentTermsLabel(terms: string) {
  return terms.replaceAll('_', ' ');
}
