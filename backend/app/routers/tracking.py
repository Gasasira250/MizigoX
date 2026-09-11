from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Load, Truck, User
from app.roles import is_admin, is_driver, is_transporter
from app.schemas import LocationPingIn, TrackingTruckOut, TruckOut
from app.tracking import ping_truck, tracking_payload

router = APIRouter(prefix="/tracking", tags=["tracking"])


@router.get("", response_model=list[TrackingTruckOut])
def live_trucks(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return tracking_payload(db)


@router.get("/loads/{load_id}", response_model=list[TrackingTruckOut])
def live_load(
    load_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = tracking_payload(db, load_id=load_id)
    if not rows:
        load = db.get(Load, load_id)
        if not load:
            raise HTTPException(status_code=404, detail="Load not found")
    return rows


@router.post("/ping", response_model=TruckOut)
def share_location(
    payload: LocationPingIn,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    truck = None
    if payload.load_id:
        load = db.get(Load, payload.load_id)
        if not load:
            raise HTTPException(status_code=404, detail="Load not found")
        if is_driver(current) and load.driver_id != current.driver_id:
            raise HTTPException(status_code=403, detail="Not your trip")
        truck = db.get(Truck, load.truck_id) if load.truck_id else None
    elif is_driver(current) and current.driver_id:
        load = (
            db.query(Load)
            .filter(Load.driver_id == current.driver_id, Load.status.in_(("accepted", "picked_up", "in_transit")))
            .first()
        )
        truck = db.get(Truck, load.truck_id) if load and load.truck_id else None
    elif is_admin(current) or is_transporter(current):
        raise HTTPException(status_code=400, detail="Pick a load to pin this truck")
    if not truck:
        raise HTTPException(status_code=400, detail="No truck assigned to ping")
    return ping_truck(db, truck, payload.lat, payload.lng, payload.load_id)
