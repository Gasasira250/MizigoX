export const SHIPMENT_STATUSES = [
  'DRAFT',
  'PENDING',
  'CONFIRMED',
  'ASSIGNED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_DESTINATION',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_TYPES = [
  'STANDARD',
  'EXPRESS',
  'DEDICATED',
  'CONSOLIDATED',
  'OTHER',
] as const;
export type ShipmentType = (typeof SHIPMENT_TYPES)[number];

export const SHIPMENT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type ShipmentPriority = (typeof SHIPMENT_PRIORITIES)[number];

export const PACKAGE_TYPES = [
  'CARTON',
  'PALLET',
  'BAG',
  'CRATE',
  'ENVELOPE',
  'DRUM',
  'OTHER',
] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];

export const WEIGHT_UNITS = ['KG', 'T'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const DIMENSION_UNITS = ['CM', 'M'] as const;
export type DimensionUnit = (typeof DIMENSION_UNITS)[number];

export const SHIPMENT_SORT_FIELDS = [
  'createdAt',
  'reference',
  'status',
  'priority',
  'estimatedDeliveryAt',
  'customerName',
] as const;
export type ShipmentSortField = (typeof SHIPMENT_SORT_FIELDS)[number];

/**
 * Backend-controlled transitions. ASSIGNED is reserved for vehicle/driver
 * assignment in a later phase and is not used by the current booking UI.
 */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  DRAFT: ['PENDING', 'CONFIRMED', 'CANCELLED'],
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY_FOR_PICKUP', 'CANCELLED'],
  ASSIGNED: ['READY_FOR_PICKUP', 'PICKED_UP', 'CANCELLED'],
  READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED', 'DELIVERY_FAILED'],
  PICKED_UP: ['IN_TRANSIT', 'CANCELLED', 'DELIVERY_FAILED'],
  IN_TRANSIT: ['AT_DESTINATION', 'OUT_FOR_DELIVERY', 'CANCELLED', 'DELIVERY_FAILED'],
  AT_DESTINATION: ['OUT_FOR_DELIVERY', 'CANCELLED', 'DELIVERY_FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'],
  DELIVERED: [],
  DELIVERY_FAILED: ['OUT_FOR_DELIVERY', 'IN_TRANSIT', 'CANCELLED'],
  CANCELLED: [],
};

export const CARGO_LOCKED_STATUSES: readonly ShipmentStatus[] = [
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_DESTINATION',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus) {
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

export function isCargoLocked(status: ShipmentStatus) {
  return CARGO_LOCKED_STATUSES.includes(status);
}

export function shipmentStatusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function shipmentTypeLabel(type: string) {
  switch (type) {
    case 'EXPRESS':
      return 'Express';
    case 'DEDICATED':
      return 'Dedicated';
    case 'CONSOLIDATED':
      return 'Consolidated';
    case 'OTHER':
      return 'Other';
    default:
      return 'Standard';
  }
}

export function shipmentPriorityLabel(priority: string) {
  switch (priority) {
    case 'LOW':
      return 'Low';
    case 'HIGH':
      return 'High';
    case 'URGENT':
      return 'Urgent';
    default:
      return 'Normal';
  }
}

export function packageTypeLabel(type: string) {
  switch (type) {
    case 'PALLET':
      return 'Pallet';
    case 'BAG':
      return 'Bag';
    case 'CRATE':
      return 'Crate';
    case 'ENVELOPE':
      return 'Envelope';
    case 'DRUM':
      return 'Drum';
    case 'OTHER':
      return 'Other';
    default:
      return 'Carton';
  }
}

export function canReadShipments(granted: readonly string[] | undefined) {
  return Boolean(
    granted?.some(
      (permission) => permission === 'shipments.manage' || permission === 'shipments.read',
    ),
  );
}

export function canCreateShipments(granted: readonly string[] | undefined) {
  return Boolean(
    granted?.some(
      (permission) => permission === 'shipments.manage' || permission === 'shipments.create',
    ),
  );
}

export function canUpdateShipments(granted: readonly string[] | undefined) {
  return Boolean(
    granted?.some(
      (permission) => permission === 'shipments.manage' || permission === 'shipments.update',
    ),
  );
}

export function canDeleteShipments(granted: readonly string[] | undefined) {
  return Boolean(
    granted?.some(
      (permission) => permission === 'shipments.manage' || permission === 'shipments.delete',
    ),
  );
}

export function canUpdateShipmentStatus(granted: readonly string[] | undefined) {
  return Boolean(
    granted?.some(
      (permission) => permission === 'shipments.manage' || permission === 'shipments.update_status',
    ),
  );
}

export function canViewShipmentHistory(granted: readonly string[] | undefined) {
  return Boolean(
    granted?.some(
      (permission) =>
        permission === 'shipments.manage' ||
        permission === 'shipments.view_history' ||
        permission === 'shipments.read',
    ),
  );
}

export interface AddressPayload {
  id: string;
  organizationId: string;
  label: string | null;
  addressType: string;
  countryCode: string;
  adminArea1: string | null;
  adminArea2: string | null;
  locality: string | null;
  subLocality: string | null;
  streetLine1: string | null;
  streetLine2: string | null;
  postalCode: string | null;
  landmark: string | null;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export interface ContactPayload {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneE164: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  status: string;
}

export interface CustomerPayload {
  id: string;
  customerReference: string;
  name: string;
  legalName: string | null;
  customerType: string;
  registrationNumber: string | null;
  taxId: string | null;
  email: string | null;
  phoneE164: string | null;
  website: string | null;
  countryCode: string;
  city: string | null;
  defaultCurrencyCode: string;
  status: string;
  notes: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  parentOrganizationId: string | null;
  preferredOperatorOrganizationId: string | null;
  creditTermsDays: number;
  primaryContactName: string | null;
  contacts: ContactPayload[];
  addresses: AddressPayload[];
}

export interface ShipmentItemPayload {
  id: string;
  description: string;
  quantity: number;
  weight: number | null;
  weightKg: number | null;
  weightUnit: string;
  length: number | null;
  width: number | null;
  height: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  dimensionUnit: string;
  volumeM3: number | null;
  packageType: string;
  isFragile: boolean;
  specialHandling: string | null;
}

export interface ShipmentEventPayload {
  id: string;
  type: string;
  previousStatus: ShipmentStatus | null;
  status: ShipmentStatus | null;
  note: string | null;
  actorUserId: string | null;
  actorName: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface ShipmentStopPayload {
  contactName: string | null;
  phoneE164: string | null;
  instructions: string | null;
  address: AddressPayload | null;
}

export interface ShipmentPayload {
  id: string;
  reference: string;
  status: ShipmentStatus;
  shipmentType: string;
  priority: string;
  description: string | null;
  customerOrganizationId: string;
  customerName: string;
  operatorOrganizationId: string;
  operatorName: string;
  cargoDescription: string | null;
  cargoType: string | null;
  weightKg: number | null;
  weightUnit: string;
  piecesCount: number | null;
  volumeM3: number | null;
  dimensionUnit: string;
  declaredValue: number | null;
  declaredCurrencyCode: string | null;
  specialInstructions: string | null;
  originCountryCode: string;
  destinationCountryCode: string;
  estimatedPickupAt: string | null;
  estimatedDeliveryAt: string | null;
  actualPickupAt: string | null;
  actualDeliveryAt: string | null;
  pickup: ShipmentStopPayload;
  delivery: ShipmentStopPayload;
  origin: AddressPayload | null;
  destination: AddressPayload | null;
  items: ShipmentItemPayload[];
  events: ShipmentEventPayload[];
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}
