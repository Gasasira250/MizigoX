export type User = {
  id: number
  email: string
  name: string
  role: string
  phone?: string
  driver_id?: number | null
}

export type Customer = {
  id: number
  name: string
  contact: string
  phone: string
  email: string
  notes: string
}

export type Driver = {
  id: number
  name: string
  phone: string
  cdl: string
  status: string
  vehicle_type?: string
  owner_user_id?: number | null
}

export type Truck = {
  id: number
  unit_number: string
  vin: string
  plate: string
  status: string
  vehicle_type?: string
  capacity_tonnes?: number
  spec?: string
  owner_user_id?: number | null
}

export type Trailer = {
  id: number
  unit_number: string
  plate: string
  status: string
}

export type LoadEvent = {
  id: number
  status: string
  note: string
  created_by: string
  created_at: string | null
}

export type Document = {
  id: number
  doc_type: string
  filename: string
  uploaded_at: string | null
}

export type Load = {
  id: number
  reference: string
  customer_id: number | null
  shipper_user_id?: number | null
  transporter_user_id?: number | null
  vehicle_type?: string
  truck_spec?: string
  pickup_location: string
  pickup_window_start: string | null
  pickup_window_end?: string | null
  delivery_location: string
  delivery_window_start: string | null
  delivery_window_end?: string | null
  commodity: string
  weight_lbs?: number
  weight_tonnes?: number
  container_count?: number
  urgency?: string
  distance_km?: number
  rate: number
  currency?: string
  trucks_needed?: number
  trucks_provided?: number
  truck_details?: string
  quote_breakdown?: string
  status: string
  driver_id: number | null
  truck_id: number | null
  trailer_id: number | null
  notes: string
  created_at?: string | null
  updated_at?: string | null
  customer?: Customer | null
  shipper?: User | null
  transporter?: User | null
  driver?: Driver | null
  truck?: Truck | null
  trailer?: Trailer | null
  events?: LoadEvent[]
  documents?: Document[]
  customer_price?: number | null
  carrier_cost?: number | null
  gross_margin?: number | null
  margin_pct?: number | null
}

export type AttentionItem = {
  kind: string
  title: string
  message: string
  load_id: number | null
  reference: string | null
  severity: string
}

export type ActivityItem = {
  id: number
  load_id: number
  reference: string
  status: string
  note: string
  created_by: string
  created_at: string | null
}

export type Availability = {
  trucks_available: number
  trucks_on_load: number
  trucks_maintenance: number
  drivers_available: number
  drivers_on_load: number
  drivers_off_duty: number
}

export type EconomicsSummary = {
  customer_price: number
  carrier_cost: number
  gross_margin: number
  margin_pct: number
  shipment_count: number
}

export type SearchHit = {
  kind: string
  id: number
  title: string
  subtitle: string
  to: string
}

export type SearchResults = {
  query: string
  results: SearchHit[]
}

export type Dashboard = {
  role: string
  open_jobs: number
  active_trips: number
  delivered: number
  earnings: number
  loads_in_transit: number
  loads_booked: number
  pickups_today: number
  deliveries_today: number
  trucks_available: number
  trucks_on_load: number
  drivers_available: number
  posted_jobs?: number
  awaiting_drivers?: number
  unread_notifications?: number
  recent_loads: Load[]
  last_updated?: string | null
  attention?: AttentionItem[]
  today_pickups?: Load[]
  today_deliveries?: Load[]
  active_shipments?: Load[]
  recent_activity?: ActivityItem[]
  availability?: Availability
  economics?: EconomicsSummary | null
}

export type Quote = {
  currency: string
  rate: number
  distance_km: number
  weight_tonnes: number
  trucks_needed: number
  vehicle_type: string
  vehicle_label: string
  truck_spec: string
  capacity_tonnes: number
  urgency: string
  trend: number
  breakdown: string
}

export type AppNotification = {
  id: number
  load_id: number | null
  kind: string
  title: string
  message: string
  read: boolean
  created_at: string | null
}

export type TrackingPing = {
  lat: number
  lng: number
  created_at?: string | null
}

export type TrackingTruck = {
  truck_id: number
  unit_number: string
  plate: string
  vehicle_type: string
  status: string
  lat: number
  lng: number
  heading: number
  speed_kmh: number
  location_updated_at: string | null
  load_id: number | null
  reference: string | null
  commodity: string
  pickup_location: string
  delivery_location: string
  load_status: string
  driver_name: string
  pickup_lat?: number | null
  pickup_lng?: number | null
  delivery_lat?: number | null
  delivery_lng?: number | null
  trail: TrackingPing[]
}

export type LoadPayload = {
  reference?: string
  customer_id?: number | null
  pickup_location: string
  pickup_window_start?: string | null
  pickup_window_end?: string | null
  delivery_location: string
  delivery_window_start?: string | null
  delivery_window_end?: string | null
  commodity?: string
  weight_tonnes?: number
  container_count?: number
  vehicle_type?: string
  truck_spec?: string
  urgency?: string
  trucks_needed?: number
  notes?: string
}
