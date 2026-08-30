import type { FinanceSummaryPayload, InvoicePayload, PaymentPayload } from './billing.js';
import type { ContactPayload, CustomerPayload, ShipmentPayload } from './shipments.js';
import type { RoutePayload, RouteStopPayload } from './routes.js';
import type { VehicleLocationPayload } from './tracking.js';

export const POD_STATUSES = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED'] as const;
export type PodStatus = (typeof POD_STATUSES)[number];

export const SEARCH_RESOURCE_TYPES = [
  'shipments',
  'customers',
  'routes',
  'vehicles',
  'drivers',
  'invoices',
] as const;
export type SearchResourceType = (typeof SEARCH_RESOURCE_TYPES)[number];

export const DRIVER_TRIP_BUCKETS = ['current', 'upcoming', 'completed'] as const;
export type DriverTripBucket = (typeof DRIVER_TRIP_BUCKETS)[number];

export interface DisplayPreferences {
  density: 'comfortable' | 'compact';
  language: string;
  timezone: string;
}

export interface UserProfilePayload {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  role: string;
  status: string;
  preferredLanguage: string;
  preferredTimezone: string;
  displayPreferences: DisplayPreferences;
  organization: {
    id: string;
    name: string;
    type: string;
    countryCode: string;
    defaultCurrencyCode: string;
    status: string;
  };
  permissions: string[];
}

export interface OrganizationSettingsPayload {
  id: string;
  type: string;
  name: string;
  legalName: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  email: string | null;
  phoneE164: string | null;
  countryCode: string;
  defaultCurrencyCode: string;
  status: string;
  timezone: string;
  address: string | null;
  logoStorageKey: string | null;
  businessDetails: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserPayload {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  status: string;
  role: string;
  organizationId: string;
  organizationName: string;
  organizationType: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface DashboardAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  href?: string;
}

export interface DashboardActivityItem {
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  href?: string;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface OperationsDashboardPayload {
  shipments: {
    active: number;
    awaitingPickup: number;
    inTransit: number;
    outForDelivery: number;
    delivered: number;
    deliveryFailed: number;
    overdue: number;
    byStatus: StatusCount[];
  };
  routes: {
    active: number;
    awaitingDispatch: number;
  };
  fleet: {
    availableVehicles: number;
    availableDrivers: number;
  };
  tracking: {
    liveVehicles: number;
    staleVehicles: number;
    lastUpdateAt: string | null;
  };
  recentShipments: Array<{
    id: string;
    reference: string;
    status: string;
    customerName: string;
    updatedAt: string;
  }>;
  recentRoutes: Array<{
    id: string;
    reference: string;
    status: string;
    origin: string | null;
    destination: string | null;
    updatedAt: string;
  }>;
  dispatchActivity: DashboardActivityItem[];
  alerts: DashboardAlert[];
}

export interface FinanceDashboardPayload {
  summary: FinanceSummaryPayload;
  paymentStatus: StatusCount[];
  recentInvoices: Array<{
    id: string;
    number: string;
    customerName: string;
    status: string;
    totalAmount: string;
    amountDue: string;
    currencyCode: string;
    dueDate: string | null;
  }>;
  recentPayments: Array<{
    id: string;
    reference: string;
    customerName: string;
    status: string;
    amount: string;
    currencyCode: string;
    paidAt: string | null;
  }>;
}

export interface CustomerDashboardPayload {
  shipments: {
    active: number;
    pending: number;
    delivered: number;
  };
  outstandingInvoices: {
    count: number;
    amountDue: string;
    currencyCode: string;
  } | null;
  recentShipments: Array<{
    id: string;
    reference: string;
    status: string;
    updatedAt: string;
  }>;
  recentActivity: DashboardActivityItem[];
}

export interface DriverDashboardPayload {
  driverId: string;
  driverName: string;
  status: string;
  currentAssignment: DriverTripSummary | null;
  nextStop: DriverStopSummary | null;
  shipmentCount: number;
  instructions: string | null;
  tracking: {
    supported: boolean;
    backgroundTrackingSupported: false;
    permissionState: 'unknown' | 'granted' | 'denied' | 'prompt';
    trackingEnabled: boolean;
    lastLocation: VehicleLocationPayload | null;
  };
}

export interface DriverStopSummary {
  id: string;
  sequence: number;
  stopType: string;
  status: string;
  formattedAddress: string;
  contactName: string | null;
  contactPhone: string | null;
  instructions: string | null;
  shipmentId: string | null;
  shipmentReference: string | null;
}

export interface DriverTripSummary {
  id: string;
  reference: string;
  status: string;
  bucket: DriverTripBucket;
  origin: string | null;
  destination: string | null;
  plannedDepartureAt: string | null;
  acceptedAt: string | null;
  vehicleRegistration: string | null;
  notes: string | null;
  shipmentCount: number;
  stopCount: number;
}

export interface DriverTripDetailPayload extends DriverTripSummary {
  stops: DriverStopSummary[];
  shipments: DriverShipmentSummary[];
  instructions: string | null;
}

export interface DriverShipmentSummary {
  id: string;
  reference: string;
  status: string;
  customerName: string;
  cargoDescription: string | null;
  piecesCount: number | null;
  deliveryContactName: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
  pickupAddress: string | null;
  specialInstructions: string | null;
}

export interface DriverTripsPayload {
  current: DriverTripSummary[];
  upcoming: DriverTripSummary[];
  completed: DriverTripSummary[];
}

export interface ProofOfDeliveryPayload {
  id: string;
  shipmentId: string;
  shipmentReference: string;
  organizationId: string;
  routeId: string | null;
  stopId: string | null;
  driverId: string | null;
  driverName: string | null;
  recipientName: string;
  recipientPhone: string | null;
  notes: string | null;
  signatureStorageKey: string | null;
  evidenceStorageKey: string | null;
  hasSignature: boolean;
  hasEvidence: boolean;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string | null;
  status: PodStatus;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHit {
  type: SearchResourceType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export interface GlobalSearchPayload {
  query: string;
  results: SearchHit[];
}

export interface AuditLogPayload {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  requestId: string | null;
}

export type {
  CustomerPayload,
  FinanceSummaryPayload,
  InvoicePayload,
  PaymentPayload,
  RoutePayload,
  RouteStopPayload,
  ShipmentPayload,
};
