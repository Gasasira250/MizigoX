export const SHIPMENT_STATUSES = [
  'DRAFT',
  'BOOKED',
  'ASSIGNED',
  'PICKUP_IN_PROGRESS',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'EXCEPTION',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** Transitions available before vehicle assignment exists. ASSIGNED is reserved for Phase 4. */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  DRAFT: ['BOOKED', 'CANCELLED'],
  BOOKED: ['IN_TRANSIT', 'CANCELLED', 'EXCEPTION'],
  ASSIGNED: ['PICKUP_IN_PROGRESS', 'IN_TRANSIT', 'CANCELLED', 'EXCEPTION'],
  PICKUP_IN_PROGRESS: ['IN_TRANSIT', 'CANCELLED', 'EXCEPTION'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'CANCELLED', 'EXCEPTION'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED', 'EXCEPTION'],
  DELIVERED: [],
  CANCELLED: [],
  EXCEPTION: ['IN_TRANSIT', 'CANCELLED'],
};

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus) {
  return SHIPMENT_TRANSITIONS[from].includes(to);
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
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
}

export interface ShipmentEventPayload {
  id: string;
  type: string;
  status: ShipmentStatus | null;
  note: string | null;
  actorUserId: string | null;
  occurredAt: string;
}

export interface ShipmentPayload {
  id: string;
  reference: string;
  status: ShipmentStatus;
  customerOrganizationId: string;
  customerName: string;
  operatorOrganizationId: string;
  operatorName: string;
  cargoDescription: string | null;
  cargoType: string | null;
  weightKg: number | null;
  piecesCount: number | null;
  specialInstructions: string | null;
  originCountryCode: string;
  destinationCountryCode: string;
  estimatedPickupAt: string | null;
  estimatedDeliveryAt: string | null;
  origin: AddressPayload | null;
  destination: AddressPayload | null;
  items: ShipmentItemPayload[];
  events: ShipmentEventPayload[];
  createdAt: string;
}
