import type { MapProvider, TrackingFreshness } from '@mizigox/shared';

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  kind: 'vehicle' | 'stop' | 'shipment';
  freshness?: TrackingFreshness;
  subtitle?: string;
}

export interface MapPathPoint {
  latitude: number;
  longitude: number;
}

export interface MapRenderProps {
  provider: MapProvider;
  publicKey: string | null;
  vehicles: MapPoint[];
  stops: MapPoint[];
  shipments: MapPoint[];
  path: MapPathPoint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}
