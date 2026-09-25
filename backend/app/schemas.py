from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterIn(BaseModel):
    email: str
    password: str
    name: str
    role: str = "customer"
    phone: str = ""


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: str
    phone: str = ""
    driver_id: int | None = None


class CustomerCreate(BaseModel):
    name: str
    contact: str = ""
    phone: str = ""
    email: str = ""
    notes: str = ""


class CustomerUpdate(BaseModel):
    name: str | None = None
    contact: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None


class CustomerOut(CustomerCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None = None


class DriverCreate(BaseModel):
    name: str
    phone: str = ""
    cdl: str = ""
    status: str = "available"
    vehicle_type: str = "double_diff"


class DriverUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    cdl: str | None = None
    status: str | None = None
    vehicle_type: str | None = None


class DriverOut(DriverCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: int | None = None


class TruckCreate(BaseModel):
    unit_number: str
    vin: str = ""
    plate: str = ""
    status: str = "available"
    vehicle_type: str = "double_diff"
    capacity_tonnes: float = 28
    spec: str = ""


class TruckUpdate(BaseModel):
    unit_number: str | None = None
    vin: str | None = None
    plate: str | None = None
    status: str | None = None
    vehicle_type: str | None = None
    capacity_tonnes: float | None = None
    spec: str | None = None


class TruckOut(TruckCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: int | None = None
    lat: float | None = None
    lng: float | None = None
    heading: float = 0
    speed_kmh: float = 0
    location_updated_at: datetime | None = None


class TrailerCreate(BaseModel):
    unit_number: str
    plate: str = ""
    status: str = "available"


class TrailerUpdate(BaseModel):
    unit_number: str | None = None
    plate: str | None = None
    status: str | None = None


class TrailerOut(TrailerCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


class LoadCreate(BaseModel):
    reference: str | None = None
    customer_id: int | None = None
    pickup_location: str
    pickup_window_start: datetime | None = None
    pickup_window_end: datetime | None = None
    delivery_location: str
    delivery_window_start: datetime | None = None
    delivery_window_end: datetime | None = None
    commodity: str = ""
    weight_tonnes: float = 0
    container_count: int = 0
    vehicle_type: str = "double_diff"
    truck_spec: str = ""
    urgency: str = "standard"
    trucks_needed: int | None = None
    notes: str = ""


class LoadUpdate(BaseModel):
    reference: str | None = None
    customer_id: int | None = None
    pickup_location: str | None = None
    pickup_window_start: datetime | None = None
    pickup_window_end: datetime | None = None
    delivery_location: str | None = None
    delivery_window_start: datetime | None = None
    delivery_window_end: datetime | None = None
    commodity: str | None = None
    weight_tonnes: float | None = None
    container_count: int | None = None
    rate: float | None = None
    vehicle_type: str | None = None
    truck_spec: str | None = None
    urgency: str | None = None
    trucks_needed: int | None = None
    notes: str | None = None


class LoadAssign(BaseModel):
    driver_id: int
    truck_id: int | None = None
    trailer_id: int | None = None


class LoadCover(BaseModel):
    trucks_provided: int = 1
    truck_id: int | None = None
    trailer_id: int | None = None
    driver_id: int | None = None
    truck_details: str = ""


class LoadStatusUpdate(BaseModel):
    status: str
    note: str = ""


class LoadEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    note: str
    created_by: str
    created_at: datetime | None = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_type: str
    filename: str
    uploaded_at: datetime | None = None


class LoadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    customer_id: int | None = None
    shipper_user_id: int | None = None
    transporter_user_id: int | None = None
    vehicle_type: str = "double_diff"
    truck_spec: str = ""
    pickup_location: str
    pickup_window_start: datetime | None = None
    pickup_window_end: datetime | None = None
    delivery_location: str
    delivery_window_start: datetime | None = None
    delivery_window_end: datetime | None = None
    commodity: str
    weight_lbs: float = 0
    weight_tonnes: float = 0
    container_count: int = 0
    urgency: str = "standard"
    distance_km: float = 0
    rate: float
    currency: str = "USD"
    trucks_needed: int = 1
    trucks_provided: int = 0
    truck_details: str = ""
    quote_breakdown: str = ""
    status: str
    driver_id: int | None = None
    truck_id: int | None = None
    trailer_id: int | None = None
    notes: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    customer: CustomerOut | None = None
    shipper: UserOut | None = None
    transporter: UserOut | None = None
    driver: DriverOut | None = None
    truck: TruckOut | None = None
    trailer: TrailerOut | None = None
    events: list[LoadEventOut] = Field(default_factory=list)
    documents: list[DocumentOut] = Field(default_factory=list)
    customer_price: float | None = None
    carrier_cost: float | None = None
    gross_margin: float | None = None
    margin_pct: float | None = None


class LoadListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    customer_id: int | None = None
    shipper_user_id: int | None = None
    transporter_user_id: int | None = None
    vehicle_type: str = "double_diff"
    truck_spec: str = ""
    pickup_location: str
    pickup_window_start: datetime | None = None
    delivery_location: str
    delivery_window_start: datetime | None = None
    commodity: str
    weight_tonnes: float = 0
    container_count: int = 0
    urgency: str = "standard"
    distance_km: float = 0
    rate: float
    currency: str = "USD"
    trucks_needed: int = 1
    trucks_provided: int = 0
    truck_details: str = ""
    status: str
    driver_id: int | None = None
    truck_id: int | None = None
    trailer_id: int | None = None
    customer: CustomerOut | None = None
    shipper: UserOut | None = None
    transporter: UserOut | None = None
    driver: DriverOut | None = None
    truck: TruckOut | None = None
    trailer: TrailerOut | None = None
    customer_price: float | None = None
    carrier_cost: float | None = None
    gross_margin: float | None = None
    margin_pct: float | None = None


class QuoteRequest(BaseModel):
    pickup_location: str
    delivery_location: str
    weight_tonnes: float = 1
    vehicle_type: str = "double_diff"
    urgency: str = "standard"
    container_count: int = 0


class QuoteOut(BaseModel):
    currency: str
    rate: float
    distance_km: float
    weight_tonnes: float
    trucks_needed: int
    vehicle_type: str
    vehicle_label: str
    truck_spec: str
    capacity_tonnes: float
    urgency: str
    trend: float
    breakdown: str


class LoadEventOutLite(LoadEventOut):
    pass


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    load_id: int | None = None
    kind: str
    title: str
    message: str
    read: bool
    created_at: datetime | None = None


class AttentionOut(BaseModel):
    kind: str
    title: str
    message: str
    load_id: int | None = None
    reference: str | None = None
    severity: str = "warn"


class ActivityOut(BaseModel):
    id: int
    load_id: int
    reference: str
    status: str
    note: str
    created_by: str
    created_at: datetime | None = None


class AvailabilityOut(BaseModel):
    trucks_available: int = 0
    trucks_on_load: int = 0
    trucks_maintenance: int = 0
    drivers_available: int = 0
    drivers_on_load: int = 0
    drivers_off_duty: int = 0


class EconomicsSummaryOut(BaseModel):
    customer_price: float = 0
    carrier_cost: float = 0
    gross_margin: float = 0
    margin_pct: float = 0
    shipment_count: int = 0


class SearchHitOut(BaseModel):
    kind: str
    id: int
    title: str
    subtitle: str
    to: str


class SearchOut(BaseModel):
    query: str
    results: list[SearchHitOut]


class DashboardOut(BaseModel):
    role: str
    open_jobs: int
    active_trips: int
    delivered: int
    earnings: float
    loads_in_transit: int
    loads_booked: int
    pickups_today: int
    deliveries_today: int
    trucks_available: int
    trucks_on_load: int
    drivers_available: int
    posted_jobs: int = 0
    awaiting_drivers: int = 0
    unread_notifications: int = 0
    recent_loads: list[LoadListOut]
    last_updated: datetime | None = None
    attention: list[AttentionOut] = Field(default_factory=list)
    today_pickups: list[LoadListOut] = Field(default_factory=list)
    today_deliveries: list[LoadListOut] = Field(default_factory=list)
    active_shipments: list[LoadListOut] = Field(default_factory=list)
    recent_activity: list[ActivityOut] = Field(default_factory=list)
    availability: AvailabilityOut = Field(default_factory=AvailabilityOut)
    economics: EconomicsSummaryOut | None = None


class LocationPingIn(BaseModel):
    lat: float
    lng: float
    load_id: int | None = None


class TrackingPingOut(BaseModel):
    lat: float
    lng: float
    created_at: datetime | None = None


class TrackingTruckOut(BaseModel):
    truck_id: int
    unit_number: str
    plate: str
    vehicle_type: str
    status: str
    lat: float
    lng: float
    heading: float = 0
    speed_kmh: float = 0
    location_updated_at: datetime | None = None
    load_id: int | None = None
    reference: str | None = None
    commodity: str = ""
    pickup_location: str = ""
    delivery_location: str = ""
    load_status: str = ""
    driver_name: str = ""
    pickup_lat: float | None = None
    pickup_lng: float | None = None
    delivery_lat: float | None = None
    delivery_lng: float | None = None
    trail: list[TrackingPingOut] = Field(default_factory=list)

