import { hasAnyPermission } from './customers.js';

export const ROUTE_STATUSES = [
  'DRAFT',
  'PLANNED',
  'READY',
  'DISPATCHED',
  'IN_TRANSIT',
  'ARRIVED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const ROUTE_TYPES = [
  'STANDARD',
  'EXPRESS',
  'DEDICATED',
  'CONSOLIDATED',
  'RETURN',
  'OTHER',
] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

export const ROUTE_STOP_TYPES = ['PICKUP', 'DELIVERY', 'WAYPOINT', 'RETURN'] as const;
export type RouteStopType = (typeof ROUTE_STOP_TYPES)[number];

export const ROUTE_STOP_STATUSES = ['PENDING', 'ARRIVED', 'SERVICED', 'SKIPPED'] as const;
export type RouteStopStatus = (typeof ROUTE_STOP_STATUSES)[number];

export const ROUTE_SORT_FIELDS = [
  'reference',
  'status',
  'plannedDepartureAt',
  'plannedArrivalAt',
  'updatedAt',
] as const;
export type RouteSortField = (typeof ROUTE_SORT_FIELDS)[number];

export const COMMITTED_ROUTE_STATUSES: readonly RouteStatus[] = [
  'READY',
  'DISPATCHED',
  'IN_TRANSIT',
  'ARRIVED',
];

export const STRUCTURAL_LOCK_STATUSES: readonly RouteStatus[] = [
  'DISPATCHED',
  'IN_TRANSIT',
  'ARRIVED',
  'COMPLETED',
];

export const TERMINAL_ROUTE_STATUSES: readonly RouteStatus[] = ['COMPLETED', 'CANCELLED'];

export const ROUTE_TRANSITIONS: Record<RouteStatus, readonly RouteStatus[]> = {
  DRAFT: ['PLANNED', 'CANCELLED'],
  PLANNED: ['DRAFT', 'READY', 'CANCELLED'],
  READY: ['PLANNED', 'DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionRoute(from: RouteStatus, to: RouteStatus) {
  return ROUTE_TRANSITIONS[from].includes(to);
}

export function isRouteStructurallyLocked(status: RouteStatus) {
  return STRUCTURAL_LOCK_STATUSES.includes(status);
}

export function isCommittedRouteStatus(status: RouteStatus) {
  return COMMITTED_ROUTE_STATUSES.includes(status);
}

export function isTerminalRouteStatus(status: RouteStatus) {
  return TERMINAL_ROUTE_STATUSES.includes(status);
}

export function routeStatusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function routeTypeLabel(type: string) {
  switch (type) {
    case 'EXPRESS':
      return 'Express';
    case 'DEDICATED':
      return 'Dedicated';
    case 'CONSOLIDATED':
      return 'Consolidated';
    case 'RETURN':
      return 'Return';
    case 'OTHER':
      return 'Other';
    default:
      return 'Standard';
  }
}

export function routeStopTypeLabel(type: string) {
  switch (type) {
    case 'DELIVERY':
      return 'Delivery';
    case 'WAYPOINT':
      return 'Waypoint';
    case 'RETURN':
      return 'Return';
    default:
      return 'Pickup';
  }
}

export function canReadRoutes(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'routes.manage', 'routes.read');
}

export function canCreateRoutes(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'routes.manage', 'routes.create');
}

export function canUpdateRoutes(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'routes.manage', 'routes.update');
}

export function canDeleteRoutes(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'routes.manage', 'routes.delete');
}

export function canDispatchRoutes(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'routes.manage',
    'routes.dispatch',
    'dispatch.manage',
    'dispatch.dispatch',
  );
}

export function canUpdateRouteStatus(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'routes.manage', 'routes.status_update', 'routes.dispatch');
}

export function canViewRouteHistory(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'routes.manage', 'routes.view_history', 'routes.read');
}

export function canReadDispatch(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'dispatch.manage', 'dispatch.read', 'routes.manage', 'routes.read');
}

export function canManageDispatch(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'dispatch.manage', 'dispatch.dispatch', 'routes.manage');
}

export function weightToKg(value: number | null | undefined, unit: string | null | undefined) {
  if (value == null) {
    return null;
  }
  return unit === 'T' ? value * 1000 : value;
}

export interface RouteStopPayload {
  id: string;
  routeId: string;
  sequence: number;
  stopType: RouteStopType;
  status: RouteStopStatus;
  shipmentId: string | null;
  shipmentReference: string | null;
  addressId: string | null;
  formattedAddress: string;
  contactName: string | null;
  contactPhone: string | null;
  plannedArrivalAt: string | null;
  actualArrivalAt: string | null;
  plannedDepartureAt: string | null;
  actualDepartureAt: string | null;
  instructions: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

export interface RouteShipmentPayload {
  id: string;
  shipmentId: string;
  reference: string;
  status: string;
  customerName: string;
  weightKg: number | null;
  volumeM3: number | null;
  piecesCount: number | null;
}

export interface RouteEventPayload {
  id: string;
  type: string;
  previousStatus: RouteStatus | null;
  status: RouteStatus | null;
  description: string | null;
  actorUserId: string | null;
  actorName: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface RoutePayload {
  id: string;
  reference: string;
  organizationId: string;
  organizationName: string;
  status: RouteStatus;
  routeType: RouteType;
  origin: string | null;
  destination: string | null;
  plannedDepartureAt: string | null;
  plannedArrivalAt: string | null;
  actualDepartureAt: string | null;
  actualArrivalAt: string | null;
  dispatchedAt: string | null;
  distanceKm: number | null;
  estimatedDurationMinutes: number | null;
  notes: string | null;
  vehicleId: string | null;
  vehicleReference: string | null;
  vehicleRegistration: string | null;
  vehicleCapacityKg: number | null;
  vehicleStatus: string | null;
  driverId: string | null;
  driverReference: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverStatus: string | null;
  shipmentCount: number;
  cargoWeightKg: number;
  cargoVolumeM3: number | null;
  shipments: RouteShipmentPayload[];
  stops: RouteStopPayload[];
  events: RouteEventPayload[];
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchValidationPayload {
  ok: boolean;
  errors: string[];
  warnings: string[];
  cargoWeightKg: number;
  vehicleCapacityKg: number | null;
  cargoVolumeM3: number | null;
}

export interface DispatchBoardPayload {
  unassignedShipments: Array<{
    id: string;
    reference: string;
    status: string;
    customerName: string;
    origin: string | null;
    destination: string | null;
    weightKg: number | null;
    estimatedPickupAt: string | null;
  }>;
  plannedRoutes: RoutePayload[];
  availableVehicles: Array<{
    id: string;
    reference: string;
    registrationNumber: string;
    vehicleTypeName: string;
    payloadCapacity: number | null;
    payloadUnit: string;
    status: string;
    availability: string;
  }>;
  availableDrivers: Array<{
    id: string;
    reference: string;
    firstName: string;
    lastName: string;
    phoneE164: string;
    status: string;
    availability: string;
  }>;
}
