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
}

export type Truck = {
  id: number
  unit_number: string
  vin: string
  plate: string
  status: string
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
  vehicle_type?: string
  pickup_location: string
  pickup_window_start: string | null
  pickup_window_end?: string | null
  delivery_location: string
  delivery_window_start: string | null
  delivery_window_end?: string | null
  commodity: string
  weight_lbs: number
  rate: number
  status: string
  driver_id: number | null
  truck_id: number | null
  trailer_id: number | null
  notes: string
  created_at?: string | null
  updated_at?: string | null
  customer?: Customer | null
  shipper?: User | null
  driver?: Driver | null
  truck?: Truck | null
  trailer?: Trailer | null
  events?: LoadEvent[]
  documents?: Document[]
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
  recent_loads: Load[]
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
  weight_lbs?: number
  rate?: number
  vehicle_type?: string
  notes?: string
}
