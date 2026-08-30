import { hasAnyPermission } from './customers.js';

export const LOCATION_SOURCES = [
  'DRIVER_APP',
  'DRIVER_WEB',
  'GPS_DEVICE',
  'TELEMATICS',
  'EXTERNAL',
  'OPERATIONS',
] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export const TRACKING_FRESHNESS_STATES = ['LIVE', 'RECENT', 'STALE', 'OFFLINE'] as const;
export type TrackingFreshness = (typeof TRACKING_FRESHNESS_STATES)[number];

export const TRACKING_EVENT_TYPES = [
  'LOCATION_UPDATED',
  'TRIP_STARTED',
  'VEHICLE_DEPARTED',
  'STOP_ARRIVED',
  'STOP_COMPLETED',
  'SHIPMENT_PICKED_UP',
  'SHIPMENT_IN_TRANSIT',
  'SHIPMENT_ARRIVED',
  'OUT_FOR_DELIVERY',
  'DELIVERY_COMPLETED',
] as const;
export type TrackingEventType = (typeof TRACKING_EVENT_TYPES)[number];

export const MAP_PROVIDERS = ['none', 'osm', 'mapbox', 'google'] as const;
export type MapProvider = (typeof MAP_PROVIDERS)[number];

export const DEFAULT_TRACKING_THRESHOLDS = {
  liveSeconds: 60,
  recentSeconds: 300,
  staleSeconds: 900,
} as const;

export function trackingFreshness(
  lastUpdatedAt: string | Date | null | undefined,
  thresholds: {
    liveSeconds: number;
    recentSeconds: number;
    staleSeconds: number;
  } = DEFAULT_TRACKING_THRESHOLDS,
): TrackingFreshness {
  if (!lastUpdatedAt) {
    return 'OFFLINE';
  }
  const updated = lastUpdatedAt instanceof Date ? lastUpdatedAt : new Date(lastUpdatedAt);
  if (Number.isNaN(updated.getTime())) {
    return 'OFFLINE';
  }
  const ageSeconds = (Date.now() - updated.getTime()) / 1000;
  if (ageSeconds < 0) {
    return 'LIVE';
  }
  if (ageSeconds <= thresholds.liveSeconds) {
    return 'LIVE';
  }
  if (ageSeconds <= thresholds.recentSeconds) {
    return 'RECENT';
  }
  if (ageSeconds <= thresholds.staleSeconds) {
    return 'STALE';
  }
  return 'OFFLINE';
}

export function trackingFreshnessLabel(state: string) {
  switch (state) {
    case 'LIVE':
      return 'Live';
    case 'RECENT':
      return 'Recently updated';
    case 'STALE':
      return 'Stale';
    default:
      return 'Offline / unknown';
  }
}

export function locationAgeSeconds(lastUpdatedAt: string | Date | null | undefined) {
  if (!lastUpdatedAt) {
    return null;
  }
  const updated = lastUpdatedAt instanceof Date ? lastUpdatedAt : new Date(lastUpdatedAt);
  if (Number.isNaN(updated.getTime())) {
    return null;
  }
  return Math.max(0, Math.round((Date.now() - updated.getTime()) / 1000));
}

export function canReadTracking(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'tracking.manage', 'tracking.read', 'tracking.view_live');
}

export function canViewLiveTracking(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'tracking.manage', 'tracking.view_live');
}

export function canViewTrackingHistory(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'tracking.manage', 'tracking.view_history', 'tracking.read');
}

export function canSubmitLocation(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'tracking.manage',
    'tracking.submit_location',
    'tracking.update_location',
  );
}

export function canManageTracking(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'tracking.manage');
}

export interface LocationRecordPayload {
  id: string;
  organizationId: string;
  vehicleId: string;
  driverId: string | null;
  routeId: string | null;
  shipmentId: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKph: number | null;
  headingDegrees: number | null;
  altitudeMeters: number | null;
  batteryPercent: number | null;
  source: LocationSource;
  deviceTimestamp: string;
  receivedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface VehicleLocationPayload {
  vehicleId: string;
  organizationId: string;
  vehicleReference: string | null;
  vehicleRegistration: string | null;
  driverId: string | null;
  driverName: string | null;
  routeId: string | null;
  routeReference: string | null;
  routeStatus: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKph: number | null;
  headingDegrees: number | null;
  lastUpdatedAt: string;
  ageSeconds: number;
  freshness: TrackingFreshness;
  source: LocationSource;
}

export interface TrackingEventPayload {
  id: string;
  type: TrackingEventType;
  organizationId: string;
  vehicleId: string | null;
  driverId: string | null;
  routeId: string | null;
  shipmentId: string | null;
  stopId: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  actorUserId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface PublicShipmentTrackingPayload {
  reference: string;
  status: string;
  pickup: {
    formattedAddress: string | null;
    contactName: string | null;
  };
  destination: {
    formattedAddress: string | null;
    contactName: string | null;
  };
  routeStatus: string | null;
  currentLocation: {
    latitude: number;
    longitude: number;
    lastUpdatedAt: string;
    freshness: TrackingFreshness;
    ageSeconds: number;
  } | null;
  lastUpdatedAt: string | null;
  estimatedArrivalAt: string | null;
  timeline: Array<{
    type: string;
    description: string | null;
    status: string | null;
    occurredAt: string;
  }>;
}

export interface AuthenticatedShipmentTrackingPayload {
  shipmentId: string;
  reference: string;
  status: string;
  customerName: string;
  pickupAddress: string | null;
  destinationAddress: string | null;
  route: {
    id: string;
    reference: string;
    status: string;
  } | null;
  currentLocation: VehicleLocationPayload | null;
  estimatedArrivalAt: string | null;
  lastUpdatedAt: string | null;
  events: TrackingEventPayload[];
  trackingTokenHint: string | null;
  hasActiveTrackingToken: boolean;
}

export interface RouteTrackingPayload {
  routeId: string;
  reference: string;
  status: string;
  origin: string | null;
  destination: string | null;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  currentLocation: VehicleLocationPayload | null;
  currentStopId: string | null;
  nextStopId: string | null;
  stops: Array<{
    id: string;
    sequence: number;
    stopType: string;
    status: string;
    formattedAddress: string;
    latitude: number | null;
    longitude: number | null;
  }>;
  lastUpdatedAt: string | null;
  freshness: TrackingFreshness;
}

export interface LiveTrackingDashboardPayload {
  vehicles: VehicleLocationPayload[];
  activeRoutes: Array<{
    id: string;
    reference: string;
    status: string;
    vehicleId: string | null;
    driverName: string | null;
    shipmentCount: number;
    freshness: TrackingFreshness;
  }>;
  activeShipments: Array<{
    id: string;
    reference: string;
    status: string;
    customerName: string;
    routeReference: string | null;
  }>;
  thresholds: {
    liveSeconds: number;
    recentSeconds: number;
    staleSeconds: number;
  };
  map: {
    provider: MapProvider;
    publicKey: string | null;
  };
}

export interface TrackingConfigPayload {
  thresholds: {
    liveSeconds: number;
    recentSeconds: number;
    staleSeconds: number;
  };
  map: {
    provider: MapProvider;
    publicKey: string | null;
  };
}

export interface ShipmentTrackingTokenPayload {
  shipmentId: string;
  token: string;
  tokenHint: string;
  createdAt: string;
  publicPath: string;
}

export interface DriverTrackingAssignmentPayload {
  driverId: string;
  driverName: string | null;
  organizationId: string;
  status: string;
  route: {
    id: string;
    reference: string;
    status: string;
    origin: string | null;
    destination: string | null;
  } | null;
  vehicle: {
    id: string;
    registration: string | null;
    reference: string | null;
  } | null;
  currentLocation: VehicleLocationPayload | null;
}
