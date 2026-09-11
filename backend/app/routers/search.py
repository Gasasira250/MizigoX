from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Customer, Driver, Load, Truck, User
from app.roles import is_admin, is_customer, is_driver, is_transporter
from app.schemas import SearchHitOut, SearchOut

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchOut)
def search(
    q: str = Query("", min_length=0),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    term = (q or "").strip()
    if len(term) < 2:
        return SearchOut(query=term, results=[])
    like = f"%{term}%"
    results: list[SearchHitOut] = []

    load_q = db.query(Load)
    if is_customer(current):
        load_q = load_q.filter(Load.shipper_user_id == current.id)
    elif is_transporter(current):
        load_q = load_q.filter((Load.status != "posted") | (Load.transporter_user_id == current.id))
    elif is_driver(current):
        load_q = load_q.filter(
            (Load.driver_id == current.driver_id)
            | ((Load.status.in_(("open", "accepted"))) & (Load.driver_id.is_(None)))
        )
    loads = (
        load_q.filter(
            Load.reference.ilike(like)
            | Load.commodity.ilike(like)
            | Load.pickup_location.ilike(like)
            | Load.delivery_location.ilike(like)
        )
        .order_by(Load.id.desc())
        .limit(8)
        .all()
    )
    for row in loads:
        results.append(
            SearchHitOut(
                kind="cargo",
                id=row.id,
                title=row.reference,
                subtitle=f"{row.commodity or 'Cargo'} · {row.pickup_location} → {row.delivery_location}",
                to=f"/loads/{row.id}",
            )
        )

    if is_admin(current) or is_transporter(current) or is_customer(current):
        customers = db.query(Customer).filter(Customer.name.ilike(like)).limit(4).all()
        if not is_admin(current):
            customers = []
        for row in customers:
            results.append(
                SearchHitOut(
                    kind="client",
                    id=row.id,
                    title=row.name,
                    subtitle=row.email or row.contact or "Client",
                    to="/customers",
                )
            )

    if is_admin(current) or is_transporter(current):
        driver_q = db.query(Driver).filter(Driver.name.ilike(like))
        truck_q = db.query(Truck).filter(
            Truck.unit_number.ilike(like) | Truck.plate.ilike(like)
        )
        if is_transporter(current):
            driver_q = driver_q.filter(Driver.owner_user_id == current.id)
            truck_q = truck_q.filter(Truck.owner_user_id == current.id)
        for row in driver_q.limit(4).all():
            results.append(
                SearchHitOut(
                    kind="driver",
                    id=row.id,
                    title=row.name,
                    subtitle=row.status.replace("_", " "),
                    to="/fleet",
                )
            )
        for row in truck_q.limit(4).all():
            results.append(
                SearchHitOut(
                    kind="truck",
                    id=row.id,
                    title=row.unit_number,
                    subtitle=row.plate or row.vehicle_type,
                    to="/tracking",
                )
            )

    if is_admin(current):
        carriers = (
            db.query(User)
            .filter(User.role == "transporter", User.name.ilike(like))
            .limit(4)
            .all()
        )
        for row in carriers:
            results.append(
                SearchHitOut(
                    kind="carrier",
                    id=row.id,
                    title=row.name,
                    subtitle="Transporter",
                    to="/transporters",
                )
            )

    return SearchOut(query=term, results=results[:16])
