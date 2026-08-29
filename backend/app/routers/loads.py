from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Customer, Driver, Load, LoadEvent, Trailer, Truck, User
from app.roles import is_customer, is_driver, is_partner
from app.schemas import (
    LoadAssign,
    LoadCreate,
    LoadListOut,
    LoadOut,
    LoadStatusUpdate,
    LoadUpdate,
)

router = APIRouter(prefix="/loads", tags=["loads"])

STATUSES = ("open", "accepted", "picked_up", "in_transit", "delivered")
TRANSITIONS = {
    "open": {"accepted"},
    "accepted": {"picked_up"},
    "picked_up": {"in_transit"},
    "in_transit": {"delivered"},
    "delivered": set(),
}

LOAD_OPTIONS = (
    joinedload(Load.customer),
    joinedload(Load.shipper),
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
    if is_partner(user):
        return True
    if is_customer(user):
        return load.shipper_user_id == user.id
    if is_driver(user):
        return load.status == "open" or load.driver_id == user.driver_id
    return False


def _scoped(query, user: User, jobs_only: bool = False):
    if jobs_only or (is_driver(user) and jobs_only):
        return query.filter(Load.status == "open")
    if is_partner(user):
        return query
    if is_customer(user):
        return query.filter(Load.shipper_user_id == user.id)
    if is_driver(user):
        return query.filter((Load.status == "open") | (Load.driver_id == user.driver_id))
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
    driver_id: int,
    truck_id: int | None,
    trailer_id: int | None,
) -> None:
    driver = db.get(Driver, driver_id)
    truck = db.get(Truck, truck_id) if truck_id else None
    trailer = db.get(Trailer, trailer_id) if trailer_id else None
    if not driver:
        raise HTTPException(status_code=400, detail="Driver not found")
    if truck_id and not truck:
        raise HTTPException(status_code=400, detail="Truck not found")
    if trailer_id and not trailer:
        raise HTTPException(status_code=400, detail="Trailer not found")
    if driver.status == "off_duty":
        raise HTTPException(status_code=400, detail="Driver is off duty")
    if truck and truck.status == "maintenance":
        raise HTTPException(status_code=400, detail="Truck is in maintenance")
    if trailer and trailer.status == "maintenance":
        raise HTTPException(status_code=400, detail="Trailer is in maintenance")

    _release_assets(load)
    driver.status = "on_load"
    if truck:
        truck.status = "on_load"
    if trailer:
        trailer.status = "on_load"
    load.driver_id = driver.id
    load.truck_id = truck.id if truck else None
    load.trailer_id = trailer.id if trailer else None


@router.get("", response_model=list[LoadListOut])
def list_loads(
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(Load).options(
        joinedload(Load.customer),
        joinedload(Load.shipper),
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
    return query.order_by(Load.id.desc()).all()


@router.get("/jobs", response_model=list[LoadListOut])
def list_jobs(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if is_customer(current):
        raise HTTPException(status_code=403, detail="Drivers and partners see the job board")
    query = db.query(Load).options(
        joinedload(Load.customer),
        joinedload(Load.shipper),
        joinedload(Load.driver),
        joinedload(Load.truck),
        joinedload(Load.trailer),
    ).filter(Load.status == "open")
    return query.order_by(Load.id.desc()).all()


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
    elif is_driver(current):
        raise HTTPException(status_code=403, detail="Drivers take jobs; they do not post cargo")
    row = Load(**data, status="open")
    db.add(row)
    db.flush()
    db.add(
        LoadEvent(
            load_id=row.id,
            status="open",
            note="Delivery request posted.",
            created_by=current.name,
        )
    )
    db.commit()
    return _get_load(db, row.id)


@router.get("/{load_id}", response_model=LoadOut)
def get_load(
    load_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    row = _get_load(db, load_id)
    if not _can_view(current, row):
        raise HTTPException(status_code=404, detail="Load not found")
    return row


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
    if is_driver(current):
        raise HTTPException(status_code=403, detail="Drivers cannot edit cargo details")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    return _get_load(db, load_id)


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
    if row.status != "open":
        raise HTTPException(status_code=400, detail="This job is no longer open")
    active = (
        db.query(Load)
        .filter(
            Load.driver_id == current.driver_id,
            Load.status.in_(("accepted", "picked_up", "in_transit")),
        )
        .first()
    )
    if active:
        raise HTTPException(status_code=400, detail="Finish your current trip first")
    _assign_assets(db, row, current.driver_id, None, None)
    row.status = "accepted"
    db.add(
        LoadEvent(
            load_id=row.id,
            status="accepted",
            note=f"{current.name} accepted this job.",
            created_by=current.name,
        )
    )
    db.commit()
    return _get_load(db, load_id)


@router.post("/{load_id}/assign", response_model=LoadOut)
def assign_load(
    load_id: int,
    payload: LoadAssign,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not is_partner(current):
        raise HTTPException(status_code=403, detail="Only partners can dispatch fleet")
    row = db.get(Load, load_id)
    if not row:
        raise HTTPException(status_code=404, detail="Load not found")
    if row.status == "delivered":
        raise HTTPException(status_code=400, detail="Cannot assign a delivered load")
    _assign_assets(db, row, payload.driver_id, payload.truck_id, payload.trailer_id)
    if row.status == "open":
        row.status = "accepted"
        db.add(
            LoadEvent(
                load_id=row.id,
                status="accepted",
                note="Partner assigned a driver.",
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
    return _get_load(db, load_id)


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
    if nxt == "accepted" and not row.driver_id:
        raise HTTPException(status_code=400, detail="A driver must take the job first")
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
    return _get_load(db, load_id)
