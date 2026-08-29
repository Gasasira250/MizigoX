import { hasAnyPermission } from './customers.js';

export const VEHICLE_TYPE_CODES = [
  'MOTORCYCLE',
  'SEDAN',
  'PICKUP',
  'VAN',
  'LIGHT_TRUCK',
  'MEDIUM_TRUCK',
  'HEAVY_TRUCK',
  'TRACTOR_HEAD',
  'TRAILER',
  'REFRIGERATED_TRUCK',
  'OTHER',
] as const;
export type VehicleTypeCode = (typeof VEHICLE_TYPE_CODES)[number];

export const VEHICLE_STATUSES = [
  'ACTIVE',
  'AVAILABLE',
  'ASSIGNED',
  'IN_TRANSIT',
  'MAINTENANCE',
  'INACTIVE',
  'RETIRED',
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_AVAILABILITIES = [
  'AVAILABLE',
  'UNAVAILABLE',
  'ASSIGNED',
  'ON_TRIP',
  'MAINTENANCE',
] as const;
export type VehicleAvailability = (typeof VEHICLE_AVAILABILITIES)[number];

export const FUEL_TYPES = ['DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID', 'CNG', 'OTHER'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const OWNERSHIP_TYPES = ['OWNED', 'LEASED', 'SUBCONTRACTED', 'OTHER'] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export const PAYLOAD_UNITS = ['KG', 'T'] as const;
export type PayloadUnit = (typeof PAYLOAD_UNITS)[number];

export const DRIVER_STATUSES = [
  'ACTIVE',
  'AVAILABLE',
  'ASSIGNED',
  'ON_TRIP',
  'OFF_DUTY',
  'SUSPENDED',
  'INACTIVE',
] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const DRIVER_AVAILABILITIES = [
  'AVAILABLE',
  'UNAVAILABLE',
  'ASSIGNED',
  'ON_TRIP',
  'OFF_DUTY',
] as const;
export type DriverAvailability = (typeof DRIVER_AVAILABILITIES)[number];

export const VEHICLE_DOCUMENT_TYPES = [
  'REGISTRATION',
  'INSURANCE',
  'INSPECTION',
  'ROADWORTHINESS',
  'OTHER',
] as const;
export type VehicleDocumentType = (typeof VEHICLE_DOCUMENT_TYPES)[number];

export const DRIVER_DOCUMENT_TYPES = ['LICENSE', 'IDENTITY', 'MEDICAL', 'OTHER'] as const;
export type DriverDocumentType = (typeof DRIVER_DOCUMENT_TYPES)[number];

export const FLEET_DOCUMENT_STATUSES = ['VALID', 'PENDING', 'REVOKED'] as const;
export type FleetDocumentStatus = (typeof FLEET_DOCUMENT_STATUSES)[number];

export const DOCUMENT_ALERT_WINDOWS = ['expired', 'today', '7', '30'] as const;
export type DocumentAlertWindow = (typeof DOCUMENT_ALERT_WINDOWS)[number];

export function isDocumentAlertWindow(value: unknown): value is DocumentAlertWindow {
  return typeof value === 'string' && (DOCUMENT_ALERT_WINDOWS as readonly string[]).includes(value);
}

export const VEHICLE_SORT_FIELDS = [
  'reference',
  'registrationNumber',
  'vehicleType',
  'status',
  'availability',
  'updatedAt',
  'payloadCapacity',
] as const;
export type VehicleSortField = (typeof VEHICLE_SORT_FIELDS)[number];

export const DRIVER_SORT_FIELDS = [
  'reference',
  'name',
  'status',
  'availability',
  'licenseExpiresAt',
  'updatedAt',
] as const;
export type DriverSortField = (typeof DRIVER_SORT_FIELDS)[number];

export const VEHICLE_TRANSITIONS: Record<VehicleStatus, readonly VehicleStatus[]> = {
  ACTIVE: ['AVAILABLE', 'MAINTENANCE', 'INACTIVE', 'RETIRED'],
  AVAILABLE: ['ASSIGNED', 'MAINTENANCE', 'INACTIVE', 'ACTIVE'],
  ASSIGNED: ['IN_TRANSIT', 'AVAILABLE', 'MAINTENANCE', 'INACTIVE'],
  IN_TRANSIT: ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE'],
  MAINTENANCE: ['ACTIVE', 'AVAILABLE', 'INACTIVE', 'RETIRED'],
  INACTIVE: ['ACTIVE', 'AVAILABLE', 'RETIRED'],
  RETIRED: [],
};

export const DRIVER_TRANSITIONS: Record<DriverStatus, readonly DriverStatus[]> = {
  ACTIVE: ['AVAILABLE', 'OFF_DUTY', 'INACTIVE', 'SUSPENDED'],
  AVAILABLE: ['ASSIGNED', 'OFF_DUTY', 'INACTIVE', 'SUSPENDED'],
  ASSIGNED: ['ON_TRIP', 'AVAILABLE', 'OFF_DUTY', 'SUSPENDED'],
  ON_TRIP: ['AVAILABLE', 'ASSIGNED', 'OFF_DUTY'],
  OFF_DUTY: ['AVAILABLE', 'ACTIVE', 'INACTIVE', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE', 'INACTIVE'],
  INACTIVE: ['ACTIVE', 'AVAILABLE'],
};

export function canTransitionVehicle(from: VehicleStatus, to: VehicleStatus) {
  return VEHICLE_TRANSITIONS[from].includes(to);
}

export function canTransitionDriver(from: DriverStatus, to: DriverStatus) {
  return DRIVER_TRANSITIONS[from].includes(to);
}

export function availabilityForVehicleStatus(status: VehicleStatus): VehicleAvailability {
  switch (status) {
    case 'AVAILABLE':
      return 'AVAILABLE';
    case 'ASSIGNED':
      return 'ASSIGNED';
    case 'IN_TRANSIT':
      return 'ON_TRIP';
    case 'MAINTENANCE':
      return 'MAINTENANCE';
    default:
      return 'UNAVAILABLE';
  }
}

export function availabilityForDriverStatus(status: DriverStatus): DriverAvailability {
  switch (status) {
    case 'AVAILABLE':
      return 'AVAILABLE';
    case 'ASSIGNED':
      return 'ASSIGNED';
    case 'ON_TRIP':
      return 'ON_TRIP';
    case 'OFF_DUTY':
      return 'OFF_DUTY';
    default:
      return 'UNAVAILABLE';
  }
}

export function vehicleTypeLabel(code: string) {
  switch (code) {
    case 'MOTORCYCLE':
      return 'Motorcycle';
    case 'SEDAN':
      return 'Sedan';
    case 'PICKUP':
      return 'Pickup';
    case 'VAN':
      return 'Van';
    case 'LIGHT_TRUCK':
      return 'Light truck';
    case 'MEDIUM_TRUCK':
      return 'Medium truck';
    case 'HEAVY_TRUCK':
      return 'Heavy truck';
    case 'TRACTOR_HEAD':
      return 'Tractor head';
    case 'TRAILER':
      return 'Trailer';
    case 'REFRIGERATED_TRUCK':
      return 'Refrigerated truck';
    default:
      return 'Other';
  }
}

export function fleetStatusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function documentAlertLabel(alert: DocumentAlert) {
  switch (alert) {
    case 'expired':
      return 'Expired';
    case 'today':
      return 'Expires today';
    case 'week':
      return 'Expires within 7 days';
    case 'month':
      return 'Expires within 30 days';
    case 'ok':
      return 'Valid';
    default:
      return 'No expiry';
  }
}

export function capacityLabel(
  capacity: number | null | undefined,
  unit: string | null | undefined,
) {
  if (capacity == null) {
    return '—';
  }
  return `${capacity} ${unit ?? 'KG'}`;
}

export type DocumentAlert = 'expired' | 'today' | 'week' | 'month' | 'ok' | 'none';

export function documentTypeLabel(type: string) {
  switch (type) {
    case 'REGISTRATION':
      return 'Registration';
    case 'INSURANCE':
      return 'Insurance';
    case 'INSPECTION':
      return 'Inspection';
    case 'ROADWORTHINESS':
      return 'Roadworthiness';
    case 'LICENSE':
      return 'Driver license';
    case 'IDENTITY':
      return 'Identity document';
    case 'MEDICAL':
      return 'Medical / fitness';
    default:
      return 'Other';
  }
}

export function documentAlert(
  expiresAt: string | null | undefined,
  now = new Date(),
): DocumentAlert {
  if (!expiresAt) {
    return 'none';
  }
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return 'none';
  }
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfExpiry = new Date(
    Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()),
  );
  const days = Math.round((startOfExpiry.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'ok';
}

export function worstDocumentAlert(alerts: readonly DocumentAlert[]): DocumentAlert {
  const rank: Record<DocumentAlert, number> = {
    expired: 0,
    today: 1,
    week: 2,
    month: 3,
    ok: 4,
    none: 5,
  };
  return alerts.reduce<DocumentAlert>(
    (worst, alert) => (rank[alert] < rank[worst] ? alert : worst),
    'none',
  );
}

export function canReadVehicles(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'vehicles.manage', 'fleet.manage', 'vehicles.read');
}

export function canCreateVehicles(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'vehicles.manage', 'fleet.manage', 'vehicles.create');
}

export function canUpdateVehicles(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'vehicles.manage', 'fleet.manage', 'vehicles.update');
}

export function canDeleteVehicles(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'vehicles.manage', 'fleet.manage', 'vehicles.delete');
}

export function canUpdateVehicleStatus(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'vehicles.manage', 'fleet.manage', 'vehicles.status_update');
}

export function canReadDrivers(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'drivers.manage', 'fleet.manage', 'drivers.read');
}

export function canCreateDrivers(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'drivers.manage', 'fleet.manage', 'drivers.create');
}

export function canUpdateDrivers(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'drivers.manage', 'fleet.manage', 'drivers.update');
}

export function canDeleteDrivers(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'drivers.manage', 'fleet.manage', 'drivers.delete');
}

export function canUpdateDriverStatus(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'drivers.manage', 'fleet.manage', 'drivers.status_update');
}

export function canReadVehicleDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.read',
  );
}

export function canManageVehicleDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.create',
    'vehicle_documents.update',
    'vehicle_documents.delete',
  );
}

export function canCreateVehicleDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.create',
  );
}

export function canUpdateVehicleDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.update',
  );
}

export function canDeleteVehicleDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.delete',
  );
}

export function canReadDriverDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'driver_documents.manage',
    'drivers.manage',
    'fleet.manage',
    'driver_documents.read',
  );
}

export function canCreateDriverDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'driver_documents.manage',
    'drivers.manage',
    'fleet.manage',
    'driver_documents.create',
  );
}

export function canUpdateDriverDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'driver_documents.manage',
    'drivers.manage',
    'fleet.manage',
    'driver_documents.update',
  );
}

export function canDeleteDriverDocuments(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'driver_documents.manage',
    'drivers.manage',
    'fleet.manage',
    'driver_documents.delete',
  );
}

export interface VehicleTypePayload {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface FleetDocumentPayload {
  id: string;
  ownerId: string;
  organizationId: string;
  documentType: string;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: FleetDocumentStatus;
  alert: DocumentAlert;
  storageProvider: string;
  storageKey: string | null;
  fileUrl: string | null;
  notes: string | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehiclePayload {
  id: string;
  reference: string;
  organizationId: string;
  organizationName: string;
  vehicleType: string;
  vehicleTypeName: string;
  registrationNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  vin: string | null;
  engineNumber: string | null;
  payloadCapacity: number | null;
  payloadUnit: string;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  fuelType: string | null;
  ownershipType: string;
  status: VehicleStatus;
  availability: VehicleAvailability;
  notes: string | null;
  documentAlert: DocumentAlert;
  documents: FleetDocumentPayload[];
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverPayload {
  id: string;
  reference: string;
  organizationId: string;
  organizationName: string;
  userId: string | null;
  userEmail: string | null;
  firstName: string;
  lastName: string;
  phoneE164: string;
  email: string | null;
  dateOfBirth: string | null;
  licenseNumber: string | null;
  licenseCategory: string | null;
  licenseIssuedAt: string | null;
  licenseExpiresAt: string | null;
  nationalityCountryCode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  status: DriverStatus;
  availability: DriverAvailability;
  notes: string | null;
  documentAlert: DocumentAlert;
  documents: FleetDocumentPayload[];
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentExpiryPayload {
  id: string;
  ownerType: 'vehicle' | 'driver';
  ownerId: string;
  ownerReference: string;
  ownerName: string;
  organizationId: string;
  documentType: string;
  documentNumber: string | null;
  expiresAt: string | null;
  alert: DocumentAlert;
  status: FleetDocumentStatus;
}
