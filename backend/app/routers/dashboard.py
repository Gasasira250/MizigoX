from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Driver, Load, LoadEvent, Notification, Truck, User
from app.present import dump_load
from app.pricing import marketplace_economics
from app.roles import is_admin, is_customer, is_driver, is_transporter
from app.schemas import (
    ActivityOut,
    AttentionOut,
    AvailabilityOut,
    DashboardOut,
    EconomicsSummaryOut,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _visible_query(db: Session, current: User):
    query = db.query(Load).options(
        joinedload(Load.customer),
        joinedload(Load.shipper),
        joinedload(Load.transporter),
        joinedload(Load.driver),
        joinedload(Load.truck),
        joinedload(Load.trailer),
    )
    if is_customer(current):
        return query.filter(Load.shipper_user_id == current.id)
    if is_driver(current):
        return query.filter(
            (Load.driver_id == current.driver_id)
            | ((Load.status.in_(("open", "accepted"))) & (Load.driver_id.is_(None)))
        )
    if is_transporter(current):
        return query.filter((Load.status == "open") | (Load.transporter_user_id == current.id))
    return query


def _is_mine(current: User, load: Load) -> bool:
    if is_admin(current):
        return True
    if is_customer(current):
        return load.shipper_user_id == current.id
    if is_driver(current):
        return load.driver_id == current.driver_id
    if is_transporter(current):
        return load.transporter_user_id == current.id
    return False


@router.get("", response_model=DashboardOut)
def dashboard(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    query = _visible_query(db, current)
    loads = query.order_by(Load.id.desc()).all()
    today = datetime.now().date()
    tomorrow = today + timedelta(days=1)
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(tomorrow, datetime.min.time())

    mine = [row for row in loads if _is_mine(current, row)]
    delivered_rows = [row for row in mine if row.status == "delivered"]
    fleet = is_admin(current) or is_transporter(current)
    unread = (
        db.query(Notification)
        .filter(Notification.user_id == current.id, Notification.read.is_(False))
        .count()
    )

    truck_q = db.query(Truck)
    driver_q = db.query(Driver)
    if is_transporter(current):
        truck_q = truck_q.filter(Truck.owner_user_id == current.id)
        driver_q = driver_q.filter(Driver.owner_user_id == current.id)
    trucks = truck_q.all() if fleet else []
    drivers = driver_q.all() if fleet else []

    availability = AvailabilityOut(
        trucks_available=sum(1 for t in trucks if t.status == "available"),
        trucks_on_load=sum(1 for t in trucks if t.status == "on_load"),
        trucks_maintenance=sum(1 for t in trucks if t.status == "maintenance"),
        drivers_available=sum(1 for d in drivers if d.status == "available"),
        drivers_on_load=sum(1 for d in drivers if d.status == "on_load"),
        drivers_off_duty=sum(1 for d in drivers if d.status == "off_duty"),
    )

    posted = [row for row in loads if row.status == "posted"]
    awaiting = [row for row in loads if row.status == "accepted" and not row.driver_id]
    urgent = [
        row
        for row in mine
        if row.urgency in ("urgent", "same_day") and row.status not in ("delivered",)
    ]
    uncovered_today = [
        row
        for row in mine
        if row.pickup_window_start
        and start <= row.pickup_window_start < end
        and row.status in ("posted", "open")
    ]

    attention: list[AttentionOut] = []
    if posted:
        attention.append(
            AttentionOut(
                kind="posted",
                title=f"{len(posted)} client post{'s' if len(posted) != 1 else ''} waiting",
                message="Send these jobs to transporters.",
                load_id=posted[0].id,
                reference=posted[0].reference,
                severity="warn",
            )
        )
    if awaiting:
        attention.append(
            AttentionOut(
                kind="driver",
                title=f"{len(awaiting)} job{'s' if len(awaiting) != 1 else ''} need a driver",
                message="Covered by a transporter but no driver has taken the trip.",
                load_id=awaiting[0].id,
                reference=awaiting[0].reference,
                severity="warn",
            )
        )
    if uncovered_today:
        attention.append(
            AttentionOut(
                kind="pickup",
                title=f"{len(uncovered_today)} loading today still uncovered",
                message="Pickup window is today and the job is not yet accepted.",
                load_id=uncovered_today[0].id,
                reference=uncovered_today[0].reference,
                severity="danger",
            )
        )
    for row in urgent[:3]:
        attention.append(
            AttentionOut(
                kind="urgency",
                title=f"{row.reference} is {row.urgency.replace('_', ' ')}",
                message=f"{row.pickup_location} → {row.delivery_location}",
                load_id=row.id,
                reference=row.reference,
                severity="danger" if row.urgency == "same_day" else "warn",
            )
        )
    if availability.trucks_maintenance:
        attention.append(
            AttentionOut(
                kind="fleet",
                title=f"{availability.trucks_maintenance} truck{'s' if availability.trucks_maintenance != 1 else ''} in maintenance",
                message="Those units are not available to assign.",
                severity="info",
            )
        )

    today_pickups = [
        row
        for row in mine
        if row.pickup_window_start and start <= row.pickup_window_start < end
    ]
    today_deliveries = [
        row
        for row in mine
        if row.delivery_window_start and start <= row.delivery_window_start < end
    ]
    active = [row for row in mine if row.status in ("accepted", "picked_up", "in_transit")]
    recent = loads[:8]

    load_ids = [row.id for row in loads[:80]]
    events = []
    if load_ids:
        events = (
            db.query(LoadEvent)
            .join(Load, Load.id == LoadEvent.load_id)
            .filter(LoadEvent.load_id.in_(load_ids))
            .order_by(LoadEvent.id.desc())
            .limit(10)
            .all()
        )
    ref_by_id = {row.id: row.reference for row in loads}
    activity = [
        ActivityOut(
            id=event.id,
            load_id=event.load_id,
            reference=ref_by_id.get(event.load_id, ""),
            status=event.status,
            note=event.note,
            created_by=event.created_by,
            created_at=event.created_at,
        )
        for event in events
    ]

    economics = None
    if is_admin(current):
        priced = [row for row in mine if row.rate]
        total = sum(row.rate for row in priced)
        eco = marketplace_economics(total)
        economics = EconomicsSummaryOut(
            **eco,
            shipment_count=len(priced),
        )

    def pack(rows):
        return [dump_load(row, current, detail=False) for row in rows]

    return DashboardOut(
        role=current.role,
        open_jobs=sum(1 for row in loads if row.status == "open"),
        active_trips=len(active),
        delivered=len(delivered_rows),
        earnings=sum(row.rate for row in delivered_rows),
        loads_in_transit=sum(1 for row in mine if row.status in ("picked_up", "in_transit")),
        loads_booked=sum(1 for row in loads if row.status in ("posted", "open")),
        pickups_today=len(today_pickups),
        deliveries_today=len(today_deliveries),
        trucks_available=availability.trucks_available,
        trucks_on_load=availability.trucks_on_load,
        drivers_available=availability.drivers_available,
        posted_jobs=len(posted),
        awaiting_drivers=len(awaiting),
        unread_notifications=unread,
        recent_loads=pack(recent),
        last_updated=datetime.now(),
        attention=attention,
        today_pickups=pack(today_pickups[:8]),
        today_deliveries=pack(today_deliveries[:8]),
        active_shipments=pack(active[:10]),
        recent_activity=activity,
        availability=availability,
        economics=economics,
    )
