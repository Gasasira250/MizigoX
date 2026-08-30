import { unprocessable } from './errors.js';

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const QTY_PATTERN = /^\d+(\.\d{1,3})?$/;

export function normalizeMoney(value: string, label = 'Amount') {
  const trimmed = value.trim();
  if (!MONEY_PATTERN.test(trimmed)) {
    throw unprocessable(`${label} must be a non-negative decimal with up to 2 places`);
  }
  const [whole, fraction = ''] = trimmed.split('.');
  return `${Number(whole)}.${fraction.padEnd(2, '0')}`;
}

export function moneyToMinor(value: string, label = 'Amount') {
  const normalized = normalizeMoney(value, label);
  const [whole, fraction] = normalized.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
}

export function minorToMoney(minor: bigint) {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}

export function addMoney(values: string[]) {
  return minorToMoney(values.reduce((sum, value) => sum + moneyToMinor(value), 0n));
}

export function subtractMoney(left: string, right: string) {
  return minorToMoney(moneyToMinor(left) - moneyToMinor(right));
}

export function compareMoney(left: string, right: string) {
  const delta = moneyToMinor(left) - moneyToMinor(right);
  if (delta < 0n) return -1;
  if (delta > 0n) return 1;
  return 0;
}

export function isZeroMoney(value: string) {
  return moneyToMinor(value) === 0n;
}

export function normalizeQuantity(value: string) {
  const trimmed = value.trim();
  if (!QTY_PATTERN.test(trimmed) || quantityToMilli(trimmed) <= 0n) {
    throw unprocessable('Quantity must be a positive decimal with up to 3 places');
  }
  return trimmed;
}

export function lineAmounts(input: {
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRatePercent: string;
}) {
  const quantity = normalizeQuantity(input.quantity);
  const unitPrice = moneyToMinor(input.unitPrice, 'Unit price');
  const discount = moneyToMinor(input.discountAmount || '0.00', 'Discount');
  const taxRate = parseTaxRate(input.taxRatePercent);
  const qtyMinor = quantityToMilli(quantity);
  const gross = (unitPrice * qtyMinor + 500n) / 1000n;
  if (discount > gross) {
    throw unprocessable('Line discount cannot exceed the line subtotal');
  }
  const lineSubtotal = gross - discount;
  const taxAmount = (lineSubtotal * taxRate + 5000n) / 10000n;
  return {
    quantity,
    unitPrice: minorToMoney(unitPrice),
    discountAmount: minorToMoney(discount),
    taxRatePercent: formatTaxRate(taxRate),
    taxAmount: minorToMoney(taxAmount),
    lineSubtotal: minorToMoney(lineSubtotal),
    lineTotal: minorToMoney(lineSubtotal + taxAmount),
  };
}

function quantityToMilli(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

function parseTaxRate(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw unprocessable('Tax rate must be a non-negative percent with up to 2 places');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const rate = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (rate > 10000n) {
    throw unprocessable('Tax rate cannot exceed 100%');
  }
  return rate;
}

function formatTaxRate(rate: bigint) {
  const whole = rate / 100n;
  const fraction = (rate % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${fraction}`;
}
