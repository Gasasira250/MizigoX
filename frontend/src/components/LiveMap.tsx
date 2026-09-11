import { useEffect, useRef } from 'react'
import type { TrackingTruck } from '../types'

type LeafletMap = {
  remove: () => void
  setView: (latlng: [number, number], zoom: number) => void
  fitBounds: (bounds: number[][], opts?: object) => void
}

type LModule = {
  map: (el: HTMLElement) => LeafletMap & { addTo?: unknown }
  tileLayer: (url: string, opts: object) => { addTo: (map: unknown) => void }
  marker: (latlng: [number, number], opts?: object) => {
    addTo: (map: unknown) => { bindPopup: (html: string) => void }
  }
  polyline: (latlngs: number[][], opts: object) => { addTo: (map: unknown) => void }
  circleMarker: (latlng: [number, number], opts: object) => {
    addTo: (map: unknown) => { bindPopup: (html: string) => void }
  }
  divIcon: (opts: object) => unknown
}

declare global {
  interface Window {
    L?: LModule
  }
}

let leafletLoading: Promise<any> | null = null

function loadLeaflet(): Promise<any> {
  if (window.L) return Promise.resolve(window.L)
  if (leafletLoading) return leafletLoading
  leafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      css.setAttribute('data-leaflet', '1')
      document.head.appendChild(css)
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet failed')))
    script.onerror = () => reject(new Error('Could not load map'))
    document.head.appendChild(script)
  })
  return leafletLoading
}

function popupHtml(truck: TrackingTruck) {
  const job = truck.reference
    ? `${truck.reference} · ${truck.commodity}<br>${truck.pickup_location} → ${truck.delivery_location}`
    : 'Parked at yard'
  return `<strong>${truck.unit_number}</strong><br>${truck.driver_name || 'No driver'}<br>${Math.round(truck.speed_kmh)} km/h<br>${job}`
}

export default function LiveMap({ trucks, focus }: { trucks: TrackingTruck[]; focus?: TrackingTruck | null }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    let cancelled = false
    loadLeaflet().then((L) => {
      if (cancelled || !el.current) return
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      const moving = trucks.filter((t) => t.lat && t.lng)
      const center: [number, number] = focus
        ? [focus.lat, focus.lng]
        : moving[0]
          ? [moving[0].lat, moving[0].lng]
          : [0.35, 32.58]
      const map = L.map(el.current)
      map.setView(center, focus ? 8 : 6)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)
      window.setTimeout(() => map.invalidateSize(), 200)

      const bounds: number[][] = []
      moving.forEach((truck) => {
        const live = truck.load_status === 'in_transit' || truck.load_status === 'picked_up'
        const icon = L.divIcon({
          className: '',
          html: `<div class="truck-pin ${live ? 'moving' : 'parked'}">${truck.unit_number}</div>`,
          iconSize: [88, 28],
          iconAnchor: [44, 14],
        })
        L.marker([truck.lat, truck.lng], { icon }).addTo(map).bindPopup(popupHtml(truck))
        bounds.push([truck.lat, truck.lng])
        if (truck.trail.length > 1) {
          L.polyline(
            truck.trail.map((p) => [p.lat, p.lng]),
            { color: '#e06c1f', weight: 3, opacity: 0.75 },
          ).addTo(map)
        }
        if (truck.pickup_lat && truck.pickup_lng) {
          L.circleMarker([truck.pickup_lat, truck.pickup_lng], {
            radius: 6,
            color: '#157a45',
            fillColor: '#157a45',
            fillOpacity: 1,
          })
            .addTo(map)
            .bindPopup(`Pickup · ${truck.pickup_location}`)
          bounds.push([truck.pickup_lat, truck.pickup_lng])
        }
        if (truck.delivery_lat && truck.delivery_lng) {
          L.circleMarker([truck.delivery_lat, truck.delivery_lng], {
            radius: 6,
            color: '#1a6aa5',
            fillColor: '#1a6aa5',
            fillOpacity: 1,
          })
            .addTo(map)
            .bindPopup(`Delivery · ${truck.delivery_location}`)
          bounds.push([truck.delivery_lat, truck.delivery_lng])
        }
      })
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28] })
      mapRef.current = map
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [trucks, focus?.truck_id])

  return <div ref={el} className="live-map" />
}
