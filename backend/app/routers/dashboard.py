from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Driver, Load, Truck, User
from app.roles import is_customer, is_driver, is_partner
from app.schemas import DashboardOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = db.query(Load)
    if is_customer(current):
        query = query.filter(Load.shipper_user_id == current.id)
    elif is_driver(current):
        query = query.filter(
            (Load.driver_id == current.driver_id) | (Load.status == "open")
        )
    loads = query.all()
    today = datetime.now().date()
    tomorrow = today + timedelta(days=1)
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(tomorrow, datetime.min.time())

    mine = [
        l
        for l in loads
        if is_partner(current)
        or (is_customer(current) and l.shipper_user_id == current.id)
        or (is_driver(current) and l.driver_id == current.driver_id)
    ]
    recent_q = db.query(Load).options(
        joinedload(Load.customer),
        joinedload(Load.shipper),
        joinedload(Load.driver),
        joinedload(Load.truck),
        joinedload(Load.trailer),
    )
    if is_customer(current):
        recent_q = recent_q.filter(Load.shipper_user_id == current.id)
    elif is_driver(current):
        recent_q = recent_q.filter(
            (Load.driver_id == current.driver_id) | (Load.status == "open")
        )
    recent = recent_q.order_by(Load.id.desc()).limit(6).all()

    delivered = [l for l in mine if l.status == "delivered"]
    return DashboardOut(
        role=current.role,
        open_jobs=sum(1 for l in loads if l.status == "open"),
        active_trips=sum(1 for l in mine if l.status in ("accepted", "picked_up", "in_transit")),
        delivered=len(delivered),
        earnings=sum(l.rate for l in delivered),
        loads_in_transit=sum(1 for l in mine if l.status in ("picked_up", "in_transit")),
        loads_booked=sum(1 for l in loads if l.status == "open"),
        pickups_today=sum(
            1
            for l in mine
            if l.pickup_window_start and start <= l.pickup_window_start < end
        ),
        deliveries_today=sum(
            1
            for l in mine
            if l.delivery_window_start and start <= l.delivery_window_start < end
        ),
        trucks_available=db.query(Truck).filter(Truck.status == "available").count()
        if is_partner(current)
        else 0,
        trucks_on_load=db.query(Truck).filter(Truck.status == "on_load").count()
        if is_partner(current)
        else 0,
        drivers_available=db.query(Driver).filter(Driver.status == "available").count()
        if is_partner(current)
        else 0,
        recent_loads=recent,
    )
