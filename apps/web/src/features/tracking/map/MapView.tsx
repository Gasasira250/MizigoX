import type { Map as LeafletMap, Marker as LeafletMarker, Polyline } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCoordinates } from '../format';
import { FreshnessBadge } from '../FreshnessBadge';
import { MapControls } from './MapControls';
import type { MapPoint, MapRenderProps } from './types';

const RWANDA_CENTER = { latitude: -1.9441, longitude: 30.0619 };

export function MapView(props: MapRenderProps) {
  const points = useMemo(
    () => [...props.vehicles, ...props.stops, ...props.shipments],
    [props.vehicles, props.stops, props.shipments],
  );
  const providerReady =
    props.provider === 'osm' || (props.provider === 'mapbox' && Boolean(props.publicKey));
  const [fitToken, setFitToken] = useState(0);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#12355b]">Map</h2>
          <p className="text-xs text-slate-500">
            {providerReady
              ? props.provider === 'osm'
                ? 'OpenStreetMap tiles. Markers are only shown for authenticated location records.'
                : 'Mapbox tiles. Markers are only shown for authenticated location records.'
              : mapUnavailableCopy(props.provider, props.publicKey)}
          </p>
        </div>
        <MapControls
          canFit={points.length > 0}
          onFit={() => setFitToken((value) => value + 1)}
          onClear={() => props.onSelect(null)}
        />
      </div>
      {providerReady ? (
        <LeafletCanvas {...props} points={points} fitToken={fitToken} />
      ) : (
        <CoordinateFallback
          points={points}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
        />
      )}
    </section>
  );
}

function mapUnavailableCopy(provider: MapRenderProps['provider'], publicKey: string | null) {
  if (provider === 'google') {
    return 'Google Maps is selected but the JavaScript SDK is not wired yet. Configure MAP_PROVIDER=osm or connect Google Maps later. No placeholder coordinates are shown.';
  }
  if (provider === 'mapbox' && !publicKey) {
    return 'Mapbox is selected but MAPBOX_ACCESS_TOKEN is not configured. No API key is hard-coded.';
  }
  return 'Map rendering is disabled (MAP_PROVIDER=none). Authenticated coordinates still appear in the list below.';
}

function CoordinateFallback({
  points,
  selectedId,
  onSelect,
}: {
  points: MapPoint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (points.length === 0) {
    return (
      <div className="px-4 py-10 text-sm text-slate-500">
        No authenticated locations to display. The map will stay empty until a driver or authorized
        device submits a real location update.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {points.map((point) => (
        <li key={point.id}>
          <button
            type="button"
            className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm ${
              selectedId === point.id ? 'bg-slate-50' : ''
            }`}
            onClick={() => onSelect(point.id)}
          >
            <span>
              <span className="font-medium text-slate-900">{point.label}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {point.kind} · {formatCoordinates(point.latitude, point.longitude)}
                {point.subtitle ? ` · ${point.subtitle}` : ''}
              </span>
            </span>
            {point.freshness ? <FreshnessBadge freshness={point.freshness} /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function LeafletCanvas({
  provider,
  publicKey,
  vehicles,
  stops,
  shipments,
  path,
  selectedId,
  onSelect,
  points,
  fitToken,
}: MapRenderProps & { points: MapPoint[]; fitToken: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const pathRef = useRef<Polyline | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current || mapRef.current) {
        return;
      }
      const map = L.map(containerRef.current, {
        center: [RWANDA_CENTER.latitude, RWANDA_CENTER.longitude],
        zoom: 7,
        scrollWheelZoom: true,
      });
      const tiles =
        provider === 'mapbox' && publicKey
          ? L.tileLayer(
              `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${publicKey}`,
              {
                attribution: '&copy; Mapbox &copy; OpenStreetMap',
                tileSize: 512,
                zoomOffset: -1,
              },
            )
          : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '&copy; OpenStreetMap contributors',
            });
      tiles.addTo(map);
      mapRef.current = map;
      setMapReady(true);
    }
    void setup();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [provider, publicKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    void import('leaflet').then((L) => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      pathRef.current?.remove();
      pathRef.current = null;
      const addMarker = (point: MapPoint, color: string) => {
        const marker = L.marker([point.latitude, point.longitude], {
          icon: L.divIcon({
            className: '',
            html: `<div style="background:${color};color:white;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:600;white-space:nowrap;border:2px solid ${
              selectedId === point.id ? '#12355b' : 'white'
            };box-shadow:0 1px 4px rgba(0,0,0,.25)">${escapeHtml(point.label)}</div>`,
            iconSize: [8, 8],
            iconAnchor: [4, 4],
          }),
        });
        marker.on('click', () => onSelect(point.id));
        marker.addTo(map);
        markersRef.current.push(marker);
      };
      vehicles.forEach((point) => addMarker(point, '#0f766e'));
      stops.forEach((point) => addMarker(point, '#4338ca'));
      shipments.forEach((point) => addMarker(point, '#b45309'));
      if (path.length >= 2) {
        pathRef.current = L.polyline(
          path.map((point) => [point.latitude, point.longitude] as [number, number]),
          { color: '#12355b', weight: 3, opacity: 0.7 },
        ).addTo(map);
      }
    });
  }, [vehicles, stops, shipments, path, selectedId, onSelect, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || points.length === 0) {
      return;
    }
    void import('leaflet').then((L) => {
      const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]));
      map.fitBounds(bounds.pad(0.2));
    });
  }, [points, fitToken, mapReady]);

  return <div ref={containerRef} className="h-[420px] w-full bg-slate-100" />;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
