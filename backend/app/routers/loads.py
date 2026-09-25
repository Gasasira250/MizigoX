from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Customer, Driver, Load, LoadEvent, Trailer, Truck, User
from app.notify import notify_admins, notify_drivers, notify_transporters, notify_users
from app.present import dump_load
from app.pricing import market_trend, quote_rate, vehicle_info
from app.roles import is_admin, is_customer, is_driver, is_transporter
from app.schemas import (
    LoadAssign,
    LoadCover,
    LoadCreate,
    LoadListOut,
    LoadOut,
    LoadStatusUpdate,
    LoadUpdate,
    QuoteOut,
    QuoteRequest,
)

router = APIRouter(prefix="/loads", tags=["loads"])

STATUSES = ("posted", "open", "accepted", "picked_up", "in_transit", "delivered")
TRANSITIONS = {
    "posted": {"open"},
    "open": {"accepted"},
    "accepted": {"picked_up"},
    "picked_up": {"in_transit"},
    "in_transit": {"delivered"},
    "delivered": set(),
}

LOAD_OPTIONS = (
    joinedload(Load.customer),
    joinedload(Load.shipper),
    joinedload(Load.transporter),
    joinedload(Load.driver),
    joinedload(Load.truck),
    joinedload(Load.trailer),
    joinedload(Load.events),
    joinedload(Load.documents),
)


def _next_reference(db: Session) -> str:
    refs = [row[0] for row in db.query(Load.reference).all()]
    nums: list[int] = []
    for ref in refs:
        if ref.startswith("MX-"):
            try:
                nums.append(int(ref.split("-", 1)[1]))
            except ValueError:
                pass
    return f"MX-{max(nums, default=10000) + 1}"


def _load_query(db: Session):
    return db.query(Load).options(*LOAD_OPTIONS)


def _get_load(db: Session, load_id: int) -> Load:
    row = _load_query(db).filter(Load.id == load_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Load not found")
    return row


def _can_view(user: User, load: Load) -> bool:
    if is_admin(user):
        return True
    if is_customer(user):
        return load.shipper_user_id == user.id
    if is_transporter(user):
        return load.status != "posted" or load.transporter_user_id == user.id
    if is_driver(user):
        if load.status == "posted":
            return False
        return load.driver_id in (None, user.driver_id) or load.status == "open"
    return False


def _scoped(query, user: User):
    if is_admin(user):
        return query
    if is_customer(user):
        return query.filter(Load.shipper_user_id == user.id)
    if is_transporter(user):
        return query.filter((Load.status != "posted") | (Load.transporter_user_id == user.id))
    if is_driver(user):
        return query.filter(
            (Load.driver_id == user.driver_id)
            | ((Load.status.in_(("open", "accepted"))) & (Load.driver_id.is_(None)))
        )
    return query.filter(False)


def _release_assets(load: Load) -> None:
    if load.driver and load.driver.status == "on_load":
        load.driver.status = "available"
    if load.truck and load.truck.status == "on_load":
        load.truck.status = "available"
    if load.trailer and load.trailer.status == "on_load":
        load.trailer.status = "available"


def _assign_assets(
    db: Session,
    load: Load,
    driver_id: int | None,
    truck_id: int | None,
    trailer_id: int | None,
) -> None:
    driver = db.get(Driver, driver_id) if driver_id else None
    truck = db.get(Truck, truck_id) if truck_id else None
    trailer = db.get(Trailer, trailer_id) if trailer_id else None
    if driver_id and not driver:
        raise HTTPException(status_code=400, detail="Driver not found")
    if truck_id and not truck:
        raise HTTPException(status_code=400, detail="Truck not found")
    if trailer_id and not trailer:
        raise HTTPException(status_code=400, detail="Trailer not found")
    if driver and driver.status == "off_duty":
        raise HTTPException(status_code=400, detail="Driver is off duty")
    if truck and truck.status == "maintenance":
        raise HTTPException(status_code=400, detail="Truck is in maintenance")
    if trailer and trailer.status == "maintenance":
        raise HTTPException(status_code=400, detail="Trailer is in maintenance")

    if driver_id or truck_id or trailer_id:
        _release_assets(load)
    if driver:
        driver.status = "on_load"
        load.driver_id = driver.id
    if truck:
        truck.status = "on_load"
        load.truck_id = truck.id
    elif truck_id is None and driver_id:
        pass
    if trailer:
        trailer.status = "on_load"
        load.trailer_id = trailer.id


def _apply_quote(db: Session, data: dict) -> dict:
    quote = quote_rate(
        data["pickup_location"],
        data["delivery_location"],
        data.get("weight_tonnes") or 0,
        data.get("vehicle_type") or "double_diff",
        data.get("urgency") or "standard",
        data.get("container_count") or 0,
        trend=market_trend(db, data.get("vehicle_type")),
    )
    info = vehicle_info(quote["vehicle_type"])
    data["vehicle_type"] = quote["vehicle_type"]
    data["truck_spec"] = data.get("truck_spec") or info["spec"]
    data["weight_tonnes"] = quote["weight_tonnes"]
    data["weight_lbs"] = round(quote["weight_tonnes"] * 2204.62, 2)
    data["distance_km"] = quote["distance_km"]
    data["rate"] = quote["rate"]
    data["currency"] = quote["currency"]
    data["trucks_needed"] = data.get("trucks_needed") or quote["trucks_needed"]
    data["quote_breakdown"] = quote["breakdown"]
    data["urgency"] = quote["urgency"]
    return data


@router.get("", response_model=list[LoadListOut])
def list_loads(
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = None,
    mine: bool = False,
    customer_id: int | None = None,
    transporter_id: int | None = None,
    driver_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(Load).options(
        joinedload(Load.customer),
        joinedload(Load.shipper),
        joinedload(Load.transporter),
        joinedload(Load.driver),
        joinedload(Load.truck),
        joinedload(Load.trailer),
    )
    if mine and is_driver(current):
        query = query.filter(Load.driver_id == current.driver_id)
    else:
        query = _scoped(query, current)
    if status_filter:
        query = query.filter(Load.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.filter(
            Load.reference.ilike(like)
            | Load.pickup_location.ilike(like)
            | Load.delivery_location.ilike(like)
            | Load.commodity.ilike(like)
        )
    if customer_id:
        query = query.filter((Load.customer_id == customer_id) | (Load.shipper_user_id == customer_id))
    if transporter_id:
        query = query.filter(Load.transporter_user_id == transporter_id)
    if driver_id:
        query = query.filter(Load.driver_id == driver_id)
    if date_from:
        query = query.filter(Load.pickup_window_start >= date_from)
    if date_to:
        query = query.filter(Load.pickup_window_start <= date_to)
    return [dump_load(row, current, detail=False) for row in query.order_by(Load.id.desc()).all()]


@router.get("/jobs", response_model=list[LoadListOut])
def list_jobs(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if is_customer(current):
        raise HTTPException(status_code=403, detail="Drivers and transporters see the job board")
    query = db.query(Load).options(
        joinedload(Load.customer),
        joinedload(Load.shipper),
        joinedload(Load.transporter),
        joinedload(Load.driver),
        joinedload(Load.truck),
        joinedload(Load.trailer),
    )
    if is_admin(current) or is_transporter(current):
        query = query.filter(Load.status == "open")
    elif is_driver(current):
        query = query.filter(
            Load.status.in_(("open", "accepted")),
            Load.driver_id.is_(None),
        )
    else:
        query = query.filter(False)
    return [dump_load(row, current, detail=False) for row in query.order_by(Load.id.desc()).all()]


@router.post("/quote", response_model=QuoteOut)
def quote_cargo(
    payload: QuoteRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return quote_rate(
        payload.pickup_location,
        payload.delivery_location,
        payload.weight_tonnes,
        payload.vehicle_type,
        payload.urgency,
        payload.container_count,
        trend=market_trend(db, payload.vehicle_type),
    )


@router.post("", response_model=LoadOut, status_code=status.HTTP_201_CREATED)
def create_load(
    payload: LoadCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    data = payload.model_dump()
    data["reference"] = data.get("reference") or _next_reference(db)
    if db.query(Load).filter(Load.reference == data["reference"]).first():
        raise HTTPException(status_code=400, detail="Reference already exists")
    if is_driver(current):
        raise HTTPException(status_code=403, detail="Drivers take jobs; they do not post cargo")
    if is_transporter(current):
        raise HTTPException(status_code=403, detail="Transporters take jobs; clients post cargo")
    if is_customer(current):
        data["shipper_user_id"] = current.id
        if not data.get("customer_id"):
            company = db.query(Customer).filter(Customer.email == current.email).first()
            if not company:
                company = Customer(
                    name=current.name,
                    contact=current.name,
                    phone=current.phone,
                    email=current.email,
                )
                db.add(company)
                db.flush()
            data["customer_id"] = company.id
    _apply_quote(db, data)
    row = Load(**data, status="posted")
    db.add(row)
    db.flush()
    db.add(
        LoadEvent(
            load_id=row.id,
            status="posted",
            note=(
                f"{current.name} posted {row.container_count or 0} containers of "
                f"{row.commodity or 'cargo'} ({row.weight_tonnes} tonnes). "
                f"Needs {row.trucks_needed} {vehicle_info(row.vehicle_type)['label']} truck(s). "
                f"Loading {row.pickup_window_start or 'TBC'}. Urgency: {row.urgency}."
            ),
            created_by=current.name,
        )
    )
    notify_admins(
        db,
        load_id=row.id,
        kind="posted",
        title="New cargo posted",
        message=f"{current.name} posted {row.reference}: {row.commodity} {row.weight_tonnes} t, {row.pickup_location} → {row.delivery_location}.",
    )
    db.commit()
    return dump_load(_get_load(db, row.id), current)


@router.get("/{load_id}", response_model=LoadOut)
def get_load(
    load_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    row = _get_load(db, load_id)
    if not _can_view(current, row):
        raise HTTPException(status_code=404, detail="Load not found")
    return dump_load(row, current)


@router.patch("/{load_id}", response_model=LoadOut)
def update_load(
    load_id: int,
    payload: LoadUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    row = db.get(Load, load_id)
    if not row:
        raise HTTPException(status_code=404, detail="Load not found")
    if is_customer(current) and row.shipper_user_id != current.id:
        raise HTTPException(status_code=403, detail="Not your shipment")
    if is_driver(current) or is_transporter(current):
        raise HTTPException(status_code=403, detail="Only the client or admin can edit cargo details")
    if row.status not in ("posted", "open"):
        raise HTTPException(status_code=400, detail="Cargo can only be edited before a transporter accepts")
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(row, key, value)
    data = {
        "pickup_location": row.pickup_location,
        "delivery_location": row.delivery_location,
        "weight_tonnes": row.weight_tonnes,
        "vehicle_type": row.vehicle_type,
        "urgency": row.urgency,
        "container_count": row.container_count,
        "truck_spec": row.truck_spec,
        "trucks_needed": row.trucks_needed,
    }
    quoted = _apply_quote(db, data)
    for key, value in quoted.items():
        setattr(row, key, value)
    db.commit()
    return dump_load(_get_load(db, load_id), current)


@router.post("/{load_id}/broadcast", response_model=LoadOut)
def broadcast_load(
    load_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not is_admin(current):
        raise HTTPException(status_code=403, detail="Only the transportation admin can send jobs to transporters")
    row = db.get(Load, load_id)
    if not row:
        raise HTTPException(status_code=404, detail="Load not found")
    if row.status != "posted":
        raise HTTPException(status_code=400, detail="This cargo has already been sent to transporters")
    row.status = "open"
    db.add(
        LoadEvent(
            load_id=row.id,
            status="open",
            note=f"{current.name} sent this job to all transporters and drivers.",
            created_by=current.name,
        )
    )
    message = (
        f"{row.reference}: {row.commodity} · {row.weight_tonnes} t · "
        f"{row.pickup_location} → {row.delivery_location}. "
        f"Need {row.trucks_needed} {vehicle_info(row.vehicle_type)['label']} truck(s). "
        f"Load date {row.pickup_window_start or 'TBC'}. Urgency: {row.urgency}."
    )
    notify_transporters(
        db,
        load_id=row.id,
        kind="broadcast",
        title="New job from admin",
        message=message,
    )
    notify_drivers(
        db,
        load_id=row.id,
        kind="broadcast",
        title="New job available",
        message=message,
    )
    if row.shipper_user_id:
        shipper = db.get(User, row.shipper_user_id)
        if shipper:
            notify_users(
                db,
                [shipper],
                load_id=row.id,
                kind="broadcast",
                title="Your cargo was sent out",
                message="Transporters and drivers have been notified to take this job.",
            )
    db.commit()
    return dump_load(_get_load(db, load_id), current)


@router.post("/{load_id}/cover", response_model=LoadOut)
def cover_load(
    load_id: int,
    payload: LoadCover,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not is_transporter(current) and not is_admin(current):
        raise HTTPException(status_code=403, detail="Only transporters can accept and provide trucks")
    row = db.get(Load, load_id)
    if not row:
        raise HTTPException(status_code=404, detail="Load not found")
    if row.status == "posted":
        raise HTTPException(status_code=400, detail="Wait for admin to send this job out")
    if row.status != "open":
        raise HTTPException(status_code=400, detail="This job is no longer open")
    _assign_assets(db, row, payload.driver_id, payload.truck_id, payload.trailer_id)
    row.transporter_user_id = current.id if is_transporter(current) else (row.transporter_user_id or current.id)
    row.trucks_provided = max(payload.trucks_provided, 1)
    details = payload.truck_details.strip()
    if payload.truck_id:
        truck = db.get(Truck, payload.truck_id)
        extra = f"Lead unit {truck.unit_number} ({vehicle_info(truck.vehicle_type)['label']}, {truck.capacity_tonnes} t)" if truck else ""
        details = f"{details} {extra}".strip()
    row.truck_details = details or f"{row.trucks_provided} truck(s) committed."
    row.status = "accepted"
    db.add(
        LoadEvent(
            load_id=row.id,
            status="accepted",
            note=f"{current.name} accepted the job and provided {row.trucks_provided} truck(s). {row.truck_details}",
            created_by=current.name,
        )
    )
    recipients = []
    if row.shipper_user_id:
        shipper = db.get(User, row.shipper_user_id)
        if shipper:
            recipients.append(shipper)
    recipients.extend([u for u in db.query(User).all() if is_admin(u)])
    notify_users(
        db,
        recipients,
        load_id=row.id,
        kind="accepted",
        title="Transporter accepted",
        message=f"{current.name} accepted {row.reference} with {row.trucks_provided} truck(s).",
    )
    if not row.driver_id:
        notify_drivers(
            db,
            load_id=row.id,
            kind="broadcast",
            title="Trucks ready — take this job",
            message=f"{current.name} covered {row.reference}. A driver still needs to take the trip.",
        )
    db.commit()
    return dump_load(_get_load(db, load_id), current)


@router.post("/{load_id}/accept", response_model=LoadOut)
def accept_load(
    load_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not is_driver(current) or not current.driver_id:
        raise HTTPException(status_code=403, detail="Only drivers can take jobs")
    row = db.get(Load, load_id)
    if not row:
        raise HTTPException(status_code=404, detail="Load not found")
    if row.status == "posted":
        raise HTTPException(status_code=400, detail="Admin has not sent this job out yet")
    if row.status not in ("open", "accepted"):
        raise HTTPException(status_code=400, detail="This job is no longer open")
    if row.driver_id and row.driver_id != current.driver_id:
        raise HTTPException(status_code=400, detail="Another driver already took this job")
    active = (
        db.query(Load)
        .filter(
            Load.driver_id == current.driver_id,
            Load.status.in_(("accepted", "picked_up", "in_transit")),
        )
        .first()
    )
    if active and active.id != row.id:
        raise HTTPException(status_code=400, detail="Finish your current trip first")
    _assign_assets(db, row, current.driver_id, row.truck_id, row.trailer_id)
    row.status = "accepted"
    db.add(
        LoadEvent(
            load_id=row.id,
            status="accepted",
            note=(
                f"{current.name} took the job. Loading {row.pickup_window_start or 'TBC'}, "
                f"urgency {row.urgency}. {row.weight_tonnes} t of {row.commodity or 'cargo'}."
            ),
            created_by=current.name,
        )
    )
    recipients = []
    if row.shipper_user_id:
        shipper = db.get(User, row.shipper_user_id)
        if shipper:
            recipients.append(shipper)
    if row.transporter_user_id:
        transporter = db.get(User, row.transporter_user_id)
        if transporter:
            recipients.append(transporter)
    recipients.extend([u for u in db.query(User).all() if is_admin(u) or is_transporter(u)])
    notify_users(
        db,
        recipients,
        load_id=row.id,
        kind="driver_assigned",
        title="Driver accepted the job",
        message=f"{current.name} accepted {row.reference} and is assigned to the cargo.",
    )
    db.commit()
    return dump_load(_get_load(db, load_id), current)


@router.post("/{load_id}/assign", response_model=LoadOut)
def assign_load(
    load_id: int,
    payload: LoadAssign,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not is_admin(current) and not is_transporter(current):
        raise HTTPException(status_code=403, detail="Only admin or the transporter can dispatch fleet")
    row = db.get(Load, load_id)
    if not row:
        raise HTTPException(status_code=404, detail="Load not found")
    if row.status == "delivered":
        raise HTTPException(status_code=400, detail="Cannot assign a delivered load")
    if is_transporter(current) and row.transporter_user_id not in (None, current.id):
        raise HTTPException(status_code=403, detail="Not your job")
    _assign_assets(db, row, payload.driver_id, payload.truck_id, payload.trailer_id)
    if is_transporter(current):
        row.transporter_user_id = current.id
    if row.status in ("posted", "open"):
        row.status = "accepted"
        db.add(
            LoadEvent(
                load_id=row.id,
                status="accepted",
                note="Driver and truck assigned to this cargo.",
                created_by=current.name,
            )
        )
    else:
        db.add(
            LoadEvent(
                load_id=row.id,
                status=row.status,
                note="Reassigned driver and equipment.",
                created_by=current.name,
            )
        )
    db.commit()
    return dump_load(_get_load(db, load_id), current)


@router.post("/{load_id}/status", response_model=LoadOut)
def update_status(
    load_id: int,
    payload: LoadStatusUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    row = db.get(Load, load_id)
    if not row:
        raise HTTPException(status_code=404, detail="Load not found")
    if is_customer(current):
        raise HTTPException(status_code=403, detail="Shippers track; drivers update status")
    if is_driver(current) and row.driver_id != current.driver_id:
        raise HTTPException(status_code=403, detail="Not your trip")
    nxt = payload.status
    if nxt not in STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status")
    if nxt not in TRANSITIONS.get(row.status, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move from {row.status} to {nxt}",
        )
    if nxt == "open" and not is_admin(current):
        raise HTTPException(status_code=403, detail="Only admin can send jobs to transporters")
    if nxt == "accepted" and not row.driver_id and not row.transporter_user_id:
        raise HTTPException(status_code=400, detail="A transporter or driver must take the job first")
    row.status = nxt
    if nxt == "delivered":
        _release_assets(row)
    db.add(
        LoadEvent(
            load_id=row.id,
            status=nxt,
            note=payload.note or f"Status set to {nxt.replace('_', ' ')}.",
            created_by=current.name,
        )
    )
    db.commit()
    return dump_load(_get_load(db, load_id), current)
