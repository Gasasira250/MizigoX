import { COUNTRIES, customerTypeLabel, type CustomerPayload } from '@mizigox/shared';
import { ApiError } from '../../shared/api/client';

export const emptyCustomerForm = {
  name: '',
  legalName: '',
  customerType: 'BUSINESS',
  registrationNumber: '',
  taxId: '',
  email: '',
  phoneE164: '',
  website: '',
  countryCode: 'RW',
  city: '',
  notes: '',
  contactFirstName: '',
  contactLastName: '',
  contactJobTitle: '',
  contactEmail: '',
  contactPhone: '',
  addressType: 'OFFICE',
  adminArea1: '',
  adminArea2: '',
  locality: '',
  subLocality: '',
  streetLine1: '',
  streetLine2: '',
  landmark: '',
};

export type CustomerFormState = typeof emptyCustomerForm;

export function formFromCustomer(customer: CustomerPayload): CustomerFormState {
  const primary = customer.contacts.find((contact) => contact.isPrimary) ?? customer.contacts[0];
  const address = customer.addresses.find((item) => item.isDefault) ?? customer.addresses[0];
  return {
    name: customer.name,
    legalName: customer.legalName ?? '',
    customerType: customer.customerType,
    registrationNumber: customer.registrationNumber ?? '',
    taxId: customer.taxId ?? '',
    email: customer.email ?? '',
    phoneE164: customer.phoneE164 ?? '',
    website: customer.website ?? '',
    countryCode: customer.countryCode,
    city: customer.city ?? '',
    notes: customer.notes ?? '',
    contactFirstName: primary?.firstName ?? '',
    contactLastName: primary?.lastName ?? '',
    contactJobTitle: primary?.jobTitle ?? '',
    contactEmail: primary?.email ?? '',
    contactPhone: primary?.phoneE164 ?? '',
    addressType: address?.addressType ?? 'OFFICE',
    adminArea1: address?.adminArea1 ?? '',
    adminArea2: address?.adminArea2 ?? '',
    locality: address?.locality ?? '',
    subLocality: address?.subLocality ?? '',
    streetLine1: address?.streetLine1 ?? '',
    streetLine2: address?.streetLine2 ?? '',
    landmark: address?.landmark ?? '',
  };
}

export function countryOptions() {
  return [...COUNTRIES].sort((left, right) => {
    if (left.code === 'RW') return -1;
    if (right.code === 'RW') return 1;
    return left.name.localeCompare(right.name);
  });
}

export function customerTypeOptions() {
  return ['BUSINESS', 'INDIVIDUAL', 'GOVERNMENT', 'NGO', 'OTHER'].map((value) => ({
    value,
    label: customerTypeLabel(value),
  }));
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

export function buildCreatePayload(form: CustomerFormState) {
  return {
    name: form.name.trim(),
    legalName: form.legalName.trim() || undefined,
    customerType: form.customerType,
    registrationNumber: form.registrationNumber.trim() || undefined,
    taxId: form.taxId.trim() || undefined,
    email: form.email.trim() || undefined,
    phoneE164: form.phoneE164.trim() || undefined,
    website: form.website.trim() || undefined,
    countryCode: form.countryCode,
    city: form.city.trim() || undefined,
    notes: form.notes.trim() || undefined,
    primaryContact:
      form.contactFirstName.trim() && form.contactLastName.trim()
        ? {
            firstName: form.contactFirstName.trim(),
            lastName: form.contactLastName.trim(),
            jobTitle: form.contactJobTitle.trim() || undefined,
            email: form.contactEmail.trim() || undefined,
            phoneE164: form.contactPhone.trim() || undefined,
            isPrimary: true,
          }
        : undefined,
    primaryAddress: form.streetLine1.trim()
      ? {
          addressType: form.addressType,
          countryCode: form.countryCode,
          adminArea1: form.adminArea1.trim() || undefined,
          adminArea2: form.adminArea2.trim() || undefined,
          locality: form.locality.trim() || form.city.trim() || undefined,
          subLocality: form.subLocality.trim() || undefined,
          streetLine1: form.streetLine1.trim(),
          streetLine2: form.streetLine2.trim() || undefined,
          landmark: form.landmark.trim() || undefined,
          isDefault: true,
        }
      : undefined,
  };
}

export function buildUpdatePayload(form: CustomerFormState) {
  return {
    name: form.name.trim(),
    legalName: form.legalName.trim() || null,
    customerType: form.customerType,
    registrationNumber: form.registrationNumber.trim() || null,
    taxId: form.taxId.trim() || null,
    email: form.email.trim() || null,
    phoneE164: form.phoneE164.trim() || null,
    website: form.website.trim() || null,
    countryCode: form.countryCode,
    city: form.city.trim() || null,
    notes: form.notes.trim() || null,
  };
}

export function validateCustomerForm(form: CustomerFormState, requireContact: boolean) {
  const errors: string[] = [];
  if (form.name.trim().length < 2) {
    errors.push('Company name is required.');
  }
  if (!form.countryCode) {
    errors.push('Country is required.');
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.push('Enter a valid email address.');
  }
  if (form.phoneE164 && !/^\+[1-9]\d{6,14}$/.test(form.phoneE164)) {
    errors.push('Phone must use international format, for example +250788123456.');
  }
  if (requireContact && (!form.contactFirstName.trim() || !form.contactLastName.trim())) {
    errors.push('Primary contact first and last name are required.');
  }
  if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
    errors.push('Enter a valid contact email address.');
  }
  if (form.contactPhone && !/^\+[1-9]\d{6,14}$/.test(form.contactPhone)) {
    errors.push('Contact phone must use international format, for example +250788123456.');
  }
  return errors;
}

export function locationLabel(customer: Pick<CustomerPayload, 'city' | 'countryCode'>) {
  return [customer.city, customer.countryCode].filter(Boolean).join(', ') || '—';
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
