import {
  COUNTRIES,
  CURRENCIES,
  PACKAGE_TYPES,
  SHIPMENT_PRIORITIES,
  SHIPMENT_TYPES,
  packageTypeLabel,
  shipmentPriorityLabel,
  shipmentTypeLabel,
  type CustomerPayload,
  type ShipmentPayload,
} from '@mizigox/shared';
import { ApiError } from '../../shared/api/client';

export interface PackageDraft {
  key: string;
  description: string;
  quantity: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  packageType: string;
  isFragile: boolean;
  specialHandling: string;
}

export interface ShipmentFormState {
  customerId: string;
  shipmentType: string;
  priority: string;
  description: string;
  cargoDescription: string;
  cargoType: string;
  estimatedPickupAt: string;
  estimatedDeliveryAt: string;
  pickupContactName: string;
  pickupPhone: string;
  pickupCountry: string;
  pickupProvince: string;
  pickupDistrict: string;
  pickupSector: string;
  pickupStreet: string;
  pickupLatitude: string;
  pickupLongitude: string;
  pickupInstructions: string;
  deliveryContactName: string;
  deliveryPhone: string;
  deliveryCountry: string;
  deliveryProvince: string;
  deliveryDistrict: string;
  deliverySector: string;
  deliveryStreet: string;
  deliveryLatitude: string;
  deliveryLongitude: string;
  deliveryInstructions: string;
  declaredValue: string;
  declaredCurrencyCode: string;
  specialInstructions: string;
  packages: PackageDraft[];
}

export function emptyPackage(): PackageDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    description: '',
    quantity: '1',
    weight: '',
    length: '',
    width: '',
    height: '',
    packageType: 'CARTON',
    isFragile: false,
    specialHandling: '',
  };
}

export function emptyShipmentForm(customerId = ''): ShipmentFormState {
  return {
    customerId,
    shipmentType: 'STANDARD',
    priority: 'NORMAL',
    description: '',
    cargoDescription: '',
    cargoType: '',
    estimatedPickupAt: '',
    estimatedDeliveryAt: '',
    pickupContactName: '',
    pickupPhone: '',
    pickupCountry: 'RW',
    pickupProvince: '',
    pickupDistrict: '',
    pickupSector: '',
    pickupStreet: '',
    pickupLatitude: '',
    pickupLongitude: '',
    pickupInstructions: '',
    deliveryContactName: '',
    deliveryPhone: '',
    deliveryCountry: 'RW',
    deliveryProvince: '',
    deliveryDistrict: '',
    deliverySector: '',
    deliveryStreet: '',
    deliveryLatitude: '',
    deliveryLongitude: '',
    deliveryInstructions: '',
    declaredValue: '',
    declaredCurrencyCode: 'RWF',
    specialInstructions: '',
    packages: [emptyPackage()],
  };
}

export function formFromShipment(shipment: ShipmentPayload): ShipmentFormState {
  return {
    customerId: shipment.customerOrganizationId,
    shipmentType: shipment.shipmentType,
    priority: shipment.priority,
    description: shipment.description ?? '',
    cargoDescription: shipment.cargoDescription ?? '',
    cargoType: shipment.cargoType ?? '',
    estimatedPickupAt: toLocalInput(shipment.estimatedPickupAt),
    estimatedDeliveryAt: toLocalInput(shipment.estimatedDeliveryAt),
    pickupContactName: shipment.pickup.contactName ?? '',
    pickupPhone: shipment.pickup.phoneE164 ?? '',
    pickupCountry: shipment.pickup.address?.countryCode ?? shipment.originCountryCode,
    pickupProvince: shipment.pickup.address?.adminArea1 ?? '',
    pickupDistrict: shipment.pickup.address?.adminArea2 ?? '',
    pickupSector: shipment.pickup.address?.subLocality ?? '',
    pickupStreet: shipment.pickup.address?.streetLine1 ?? '',
    pickupLatitude:
      shipment.pickup.address?.latitude != null ? String(shipment.pickup.address.latitude) : '',
    pickupLongitude:
      shipment.pickup.address?.longitude != null ? String(shipment.pickup.address.longitude) : '',
    pickupInstructions: shipment.pickup.instructions ?? '',
    deliveryContactName: shipment.delivery.contactName ?? '',
    deliveryPhone: shipment.delivery.phoneE164 ?? '',
    deliveryCountry: shipment.delivery.address?.countryCode ?? shipment.destinationCountryCode,
    deliveryProvince: shipment.delivery.address?.adminArea1 ?? '',
    deliveryDistrict: shipment.delivery.address?.adminArea2 ?? '',
    deliverySector: shipment.delivery.address?.subLocality ?? '',
    deliveryStreet: shipment.delivery.address?.streetLine1 ?? '',
    deliveryLatitude:
      shipment.delivery.address?.latitude != null ? String(shipment.delivery.address.latitude) : '',
    deliveryLongitude:
      shipment.delivery.address?.longitude != null
        ? String(shipment.delivery.address.longitude)
        : '',
    deliveryInstructions: shipment.delivery.instructions ?? '',
    declaredValue: shipment.declaredValue != null ? String(shipment.declaredValue) : '',
    declaredCurrencyCode: shipment.declaredCurrencyCode ?? 'RWF',
    specialInstructions: shipment.specialInstructions ?? '',
    packages:
      shipment.items.length > 0
        ? shipment.items.map((item) => ({
            key: item.id,
            description: item.description,
            quantity: String(item.quantity),
            weight: item.weightKg != null ? String(item.weightKg) : '',
            length: item.lengthCm != null ? String(item.lengthCm) : '',
            width: item.widthCm != null ? String(item.widthCm) : '',
            height: item.heightCm != null ? String(item.heightCm) : '',
            packageType: item.packageType,
            isFragile: item.isFragile,
            specialHandling: item.specialHandling ?? '',
          }))
        : [emptyPackage()],
  };
}

export function buildShipmentPayload(
  form: ShipmentFormState,
  options: { includeCustomer: boolean; cargoLocked?: boolean; status?: 'DRAFT' | 'CONFIRMED' },
) {
  const payload: Record<string, unknown> = {
    customerOrganizationId: options.includeCustomer ? form.customerId : undefined,
    shipmentType: form.shipmentType,
    priority: form.priority,
    description: form.description.trim() || undefined,
    cargoDescription: form.cargoDescription.trim(),
    cargoType: form.cargoType.trim() || undefined,
    estimatedPickupAt: form.estimatedPickupAt || undefined,
    estimatedDeliveryAt: form.estimatedDeliveryAt || undefined,
    declaredValue: form.declaredValue ? Number(form.declaredValue) : undefined,
    declaredCurrencyCode: form.declaredCurrencyCode || undefined,
    specialInstructions: form.specialInstructions.trim() || undefined,
    status: options.status,
  };
  if (!options.cargoLocked) {
    payload.pickup = {
      contactName: form.pickupContactName.trim() || undefined,
      phoneE164: form.pickupPhone.trim() || undefined,
      instructions: form.pickupInstructions.trim() || undefined,
      countryCode: form.pickupCountry,
      adminArea1: form.pickupProvince.trim() || undefined,
      adminArea2: form.pickupDistrict.trim() || undefined,
      subLocality: form.pickupSector.trim() || undefined,
      streetLine1: form.pickupStreet.trim(),
      latitude: form.pickupLatitude ? Number(form.pickupLatitude) : undefined,
      longitude: form.pickupLongitude ? Number(form.pickupLongitude) : undefined,
    };
    payload.delivery = {
      contactName: form.deliveryContactName.trim() || undefined,
      phoneE164: form.deliveryPhone.trim() || undefined,
      instructions: form.deliveryInstructions.trim() || undefined,
      countryCode: form.deliveryCountry,
      adminArea1: form.deliveryProvince.trim() || undefined,
      adminArea2: form.deliveryDistrict.trim() || undefined,
      subLocality: form.deliverySector.trim() || undefined,
      streetLine1: form.deliveryStreet.trim(),
      latitude: form.deliveryLatitude ? Number(form.deliveryLatitude) : undefined,
      longitude: form.deliveryLongitude ? Number(form.deliveryLongitude) : undefined,
    };
    payload.items = form.packages
      .filter((item) => item.description.trim())
      .map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity) || 1,
        weightKg: item.weight ? Number(item.weight) : undefined,
        lengthCm: item.length ? Number(item.length) : undefined,
        widthCm: item.width ? Number(item.width) : undefined,
        heightCm: item.height ? Number(item.height) : undefined,
        packageType: item.packageType,
        isFragile: item.isFragile,
        specialHandling: item.specialHandling.trim() || undefined,
      }));
  }
  return payload;
}

export function validateShipmentForm(form: ShipmentFormState, requireCustomer: boolean) {
  const errors: string[] = [];
  if (requireCustomer && !form.customerId) {
    errors.push('Select a customer.');
  }
  if (!form.cargoDescription.trim()) {
    errors.push('Cargo description is required.');
  }
  if (!form.pickupStreet.trim()) {
    errors.push('Pickup street is required.');
  }
  if (!form.deliveryStreet.trim()) {
    errors.push('Delivery street is required.');
  }
  if (form.pickupPhone && !/^\+[1-9]\d{6,14}$/.test(form.pickupPhone)) {
    errors.push('Pickup phone must use international format, for example +250788123456.');
  }
  if (form.deliveryPhone && !/^\+[1-9]\d{6,14}$/.test(form.deliveryPhone)) {
    errors.push('Delivery phone must use international format, for example +250788123456.');
  }
  if (form.declaredValue && Number(form.declaredValue) < 0) {
    errors.push('Declared value cannot be negative.');
  }
  if (
    (form.pickupLatitude && !form.pickupLongitude) ||
    (!form.pickupLatitude && form.pickupLongitude)
  ) {
    errors.push('Pickup latitude and longitude must be provided together.');
  }
  if (
    (form.deliveryLatitude && !form.deliveryLongitude) ||
    (!form.deliveryLatitude && form.deliveryLongitude)
  ) {
    errors.push('Delivery latitude and longitude must be provided together.');
  }
  for (const item of form.packages.filter((row) => row.description.trim())) {
    if (Number(item.quantity) < 1) {
      errors.push('Package quantity must be at least 1.');
    }
    if (item.weight && Number(item.weight) < 0) {
      errors.push('Package weight cannot be negative.');
    }
    for (const dimension of [item.length, item.width, item.height]) {
      if (dimension && Number(dimension) < 0) {
        errors.push('Package dimensions cannot be negative.');
      }
    }
  }
  return errors;
}

export function formatStop(stop: ShipmentPayload['pickup'] | ShipmentPayload['delivery']) {
  if (stop.address?.formattedAddress) {
    return stop.address.formattedAddress;
  }
  return (
    [
      stop.address?.streetLine1,
      stop.address?.subLocality,
      stop.address?.adminArea2,
      stop.address?.adminArea1,
      stop.address?.countryCode,
    ]
      .filter(Boolean)
      .join(', ') || '—'
  );
}

export function selectedCustomer(customers: CustomerPayload[], id: string) {
  return customers.find((customer) => customer.id === id) ?? null;
}

export function countryOptions() {
  return [...COUNTRIES].sort((left, right) => {
    if (left.code === 'RW') return -1;
    if (right.code === 'RW') return 1;
    return left.name.localeCompare(right.name);
  });
}

export function typeOptions() {
  return SHIPMENT_TYPES.map((value) => ({ value, label: shipmentTypeLabel(value) }));
}

export function priorityOptions() {
  return SHIPMENT_PRIORITIES.map((value) => ({ value, label: shipmentPriorityLabel(value) }));
}

export function packageOptions() {
  return PACKAGE_TYPES.map((value) => ({ value, label: packageTypeLabel(value) }));
}

export function currencyOptions() {
  return CURRENCIES.map((currency) => ({
    value: currency.code,
    label: `${currency.code} · ${currency.name}`,
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

export function toLocalInput(value: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
