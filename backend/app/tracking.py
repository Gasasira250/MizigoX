from datetime import datetime
from math import atan2, cos, degrees, radians, sin

from sqlalchemy.orm import Session, joinedload

from app.models import Load, Truck, TruckPing
from app.pricing import city_coords

YARD = (0.3476, 32.5825)  # Kampala yard for parked trucks
ACTIVE = ("accepted", "picked_up", "in_transit")


def _bearing(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (*a, *b))
    dlon = lon2 - lon1
    x = sin(dlon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    return (degrees(atan2(x, y)) + 360) % 360


def _lerp(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    t = max(0.0, min(1.0, t))
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _progress(load: Load) -> tuple[float, float]:
    """Return (fraction along route 0-1, speed km/h)."""
    now = datetime.now().timestamp()
    wave = (now / 55 + load.id * 13) % 100 / 100
    if load.status == "accepted":
        return 0.02 + wave * 0.04, 8
    if load.status == "picked_up":
        return 0.08 + wave * 0.12, 42
    # in_transit: keep moving along the corridor
    return 0.22 + wave * 0.62, 68


def _record_ping(db: Session, truck: Truck, load_id: int | None) -> None:
    if truck.lat is None or truck.lng is None:
        return
    last = (
        db.query(TruckPing)
        .filter(TruckPing.truck_id == truck.id)
        .order_by(TruckPing.id.desc())
        .first()
    )
    if last and abs(last.lat - truck.lat) < 0.0004 and abs(last.lng - truck.lng) < 0.0004:
        return
    db.add(
        TruckPing(
            truck_id=truck.id,
            load_id=load_id,
            lat=truck.lat,
            lng=truck.lng,
            heading=truck.heading or 0,
            speed_kmh=truck.speed_kmh or 0,
        )
    )
    extra = (
        db.query(TruckPing)
        .filter(TruckPing.truck_id == truck.id)
        .order_by(TruckPing.id.desc())
        .offset(24)
        .all()
    )
    for row in extra:
        db.delete(row)


def simulate_positions(db: Session) -> None:
    now = datetime.now()
    used: set[int] = set()
    loads = (
        db.query(Load)
        .options(joinedload(Load.truck), joinedload(Load.driver))
        .filter(Load.status.in_(ACTIVE), Load.truck_id.isnot(None))
        .all()
    )
    for load in loads:
        truck = load.truck
        if not truck:
            continue
        start = city_coords(load.pickup_location)
        end = city_coords(load.delivery_location)
        if not start:
            start = YARD
        if not end or end == start:
            end = (-1.2921, 36.8219)
        frac, speed = _progress(load)
        lat, lng = _lerp(start, end, frac)
        truck.lat = round(lat, 5)
        truck.lng = round(lng, 5)
        truck.heading = round(_bearing(start, end), 1)
        truck.speed_kmh = speed
        truck.location_updated_at = now
        truck.status = "on_load"
        used.add(truck.id)
        _record_ping(db, truck, load.id)

    parked = db.query(Truck).all()
    if used:
        parked = [truck for truck in parked if truck.id not in used]
    for i, truck in enumerate(parked):
        if truck.status == "maintenance":
            truck.lat = YARD[0] + 0.012
            truck.lng = YARD[1] - 0.01
            truck.speed_kmh = 0
        else:
            truck.lat = YARD[0] + (i % 5) * 0.0018
            truck.lng = YARD[1] + (i % 4) * 0.0016
            truck.speed_kmh = 0
            truck.heading = 90
        truck.location_updated_at = now
    db.commit()


def _trail(db: Session, truck_id: int) -> list[TruckPing]:
    return (
        db.query(TruckPing)
        .filter(TruckPing.truck_id == truck_id)
        .order_by(TruckPing.id.asc())
        .limit(24)
        .all()
    )


def tracking_payload(db: Session, load_id: int | None = None) -> list[dict]:
    simulate_positions(db)
    rows = []
    query = (
        db.query(Load)
        .options(joinedload(Load.truck), joinedload(Load.driver))
        .filter(Load.status.in_(ACTIVE), Load.truck_id.isnot(None))
    )
    if load_id:
        query = query.filter(Load.id == load_id)
    for load in query.all():
        truck = load.truck
        if not truck or truck.lat is None:
            continue
        start = city_coords(load.pickup_location)
        end = city_coords(load.delivery_location)
        if not start:
            start = YARD
        if not end or end == start:
            end = (-1.2921, 36.8219)
        rows.append(
            {
                "truck_id": truck.id,
                "unit_number": truck.unit_number,
                "plate": truck.plate,
                "vehicle_type": truck.vehicle_type,
                "status": truck.status,
                "lat": truck.lat,
                "lng": truck.lng,
                "heading": truck.heading or 0,
                "speed_kmh": truck.speed_kmh or 0,
                "location_updated_at": truck.location_updated_at,
                "load_id": load.id,
                "reference": load.reference,
                "commodity": load.commodity,
                "pickup_location": load.pickup_location,
                "delivery_location": load.delivery_location,
                "load_status": load.status,
                "driver_name": load.driver.name if load.driver else "",
                "pickup_lat": start[0],
                "pickup_lng": start[1],
                "delivery_lat": end[0],
                "delivery_lng": end[1],
                "trail": [
                    {"lat": p.lat, "lng": p.lng, "created_at": p.created_at}
                    for p in _trail(db, truck.id)
                ],
            }
        )
    if load_id:
        return rows
    seen = {row["truck_id"] for row in rows}
    idle = db.query(Truck).filter(Truck.lat.isnot(None)).all()
    for truck in idle:
        if truck.id in seen:
            continue
        rows.append(
            {
                "truck_id": truck.id,
                "unit_number": truck.unit_number,
                "plate": truck.plate,
                "vehicle_type": truck.vehicle_type,
                "status": truck.status,
                "lat": truck.lat,
                "lng": truck.lng,
                "heading": truck.heading or 0,
                "speed_kmh": 0,
                "location_updated_at": truck.location_updated_at,
                "load_id": None,
                "reference": None,
                "commodity": "",
                "pickup_location": "",
                "delivery_location": "",
                "load_status": "parked",
                "driver_name": "",
                "pickup_lat": None,
                "pickup_lng": None,
                "delivery_lat": None,
                "delivery_lng": None,
                "trail": [],
            }
        )
    return rows


def ping_truck(db: Session, truck: Truck, lat: float, lng: float, load_id: int | None) -> Truck:
    truck.lat = lat
    truck.lng = lng
    truck.speed_kmh = 45
    truck.location_updated_at = datetime.now()
    _record_ping(db, truck, load_id)
    db.commit()
    db.refresh(truck)
    return truck
