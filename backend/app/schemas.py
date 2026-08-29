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


class DriverUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    cdl: str | None = None
    status: str | None = None


class DriverOut(DriverCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


class TruckCreate(BaseModel):
    unit_number: str
    vin: str = ""
    plate: str = ""
    status: str = "available"


class TruckUpdate(BaseModel):
    unit_number: str | None = None
    vin: str | None = None
    plate: str | None = None
    status: str | None = None


class TruckOut(TruckCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


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
    weight_lbs: float = 0
    rate: float = 0
    vehicle_type: str = "truck"
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
    weight_lbs: float | None = None
    rate: float | None = None
    vehicle_type: str | None = None
    notes: str | None = None


class LoadAssign(BaseModel):
    driver_id: int
    truck_id: int | None = None
    trailer_id: int | None = None


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
    vehicle_type: str = "truck"
    pickup_location: str
    pickup_window_start: datetime | None = None
    pickup_window_end: datetime | None = None
    delivery_location: str
    delivery_window_start: datetime | None = None
    delivery_window_end: datetime | None = None
    commodity: str
    weight_lbs: float
    rate: float
    status: str
    driver_id: int | None = None
    truck_id: int | None = None
    trailer_id: int | None = None
    notes: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    customer: CustomerOut | None = None
    shipper: UserOut | None = None
    driver: DriverOut | None = None
    truck: TruckOut | None = None
    trailer: TrailerOut | None = None
    events: list[LoadEventOut] = Field(default_factory=list)
    documents: list[DocumentOut] = Field(default_factory=list)


class LoadListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    customer_id: int | None = None
    shipper_user_id: int | None = None
    vehicle_type: str = "truck"
    pickup_location: str
    pickup_window_start: datetime | None = None
    delivery_location: str
    delivery_window_start: datetime | None = None
    commodity: str
    weight_lbs: float
    rate: float
    status: str
    driver_id: int | None = None
    truck_id: int | None = None
    trailer_id: int | None = None
    customer: CustomerOut | None = None
    shipper: UserOut | None = None
    driver: DriverOut | None = None
    truck: TruckOut | None = None
    trailer: TrailerOut | None = None


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
    recent_loads: list[LoadListOut]
