from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Customer, Document, Driver, Load, LoadEvent, Trailer, Truck, User

DEMO = {
    "dispatcher": ("dispatcher@mizigox.com", "dispatcher", "Jordan Hale"),
    "customer": ("cargo@mizigox.com", "cargo", "Amina Diallo"),
    "driver": ("driver@mizigox.com", "driver", "Marcus Webb"),
    "partner": ("partner@mizigox.com", "partner", "Alex Rivera"),
}


def _dt(days: int, hour: int) -> datetime:
    base = datetime.now().replace(minute=0, second=0, microsecond=0)
    return base + timedelta(days=days, hours=hour - base.hour)


def seed_if_empty(db: Session) -> None:
    if db.query(User).first():
        return

    customers = [
        Customer(
            name="Amina's Market",
            contact="Amina Diallo",
            phone="555-100-2001",
            email="cargo@mizigox.com",
            notes="Shop owner posting local and intercity cargo.",
        ),
        Customer(
            name="Lakeside Produce",
            contact="Maya Chen",
            phone="414-555-0198",
            email="shipping@lakesideproduce.example",
            notes="Produce and reefer freight.",
        ),
        Customer(
            name="Northline Steel",
            contact="Chris Novak",
            phone="216-555-0110",
            email="logistics@northlinesteel.example",
            notes="Flatbed / steel.",
        ),
        Customer(
            name="Harbor Retail Co.",
            contact="Priya Shah",
            phone="201-555-0166",
            email="inbound@harborretail.example",
            notes="Store deliveries.",
        ),
    ]
    db.add_all(customers)
    db.flush()

    drivers = [
        Driver(name="Marcus Webb", phone="555-201-4401", cdl="IL-CDL-8821", status="on_load"),
        Driver(name="Elena Vasquez", phone="555-201-4402", cdl="WI-CDL-4410", status="on_load"),
        Driver(name="Devon Brooks", phone="555-201-4403", cdl="OH-CDL-1092", status="available"),
        Driver(name="Samir Patel", phone="555-201-4404", cdl="IN-CDL-7744", status="available"),
        Driver(name="Riley Thompson", phone="555-201-4405", cdl="MI-CDL-3308", status="available"),
    ]
    db.add_all(drivers)
    db.flush()

    db.add_all(
        [
            User(
                email=DEMO["dispatcher"][0],
                hashed_password=hash_password(DEMO["dispatcher"][1]),
                name=DEMO["dispatcher"][2],
                phone="555-300-0100",
                role="dispatcher",
            ),
            User(
                email=DEMO["customer"][0],
                hashed_password=hash_password(DEMO["customer"][1]),
                name=DEMO["customer"][2],
                phone="555-100-2001",
                role="customer",
            ),
            User(
                email=DEMO["driver"][0],
                hashed_password=hash_password(DEMO["driver"][1]),
                name=DEMO["driver"][2],
                phone="555-201-4401",
                role="driver",
                driver_id=drivers[0].id,
            ),
            User(
                email=DEMO["partner"][0],
                hashed_password=hash_password(DEMO["partner"][1]),
                name=DEMO["partner"][2],
                phone="555-300-1000",
                role="partner",
            ),
        ]
    )
    db.flush()
    amina = db.query(User).filter(User.email == DEMO["customer"][0]).first()

    trucks = [
        Truck(unit_number="T-101", vin="1FUJGLDR8HLBB0101", plate="IL 4412", status="on_load"),
        Truck(unit_number="T-104", vin="1FUJGLDR8HLBB0104", plate="WI 8820", status="on_load"),
        Truck(unit_number="T-107", vin="1FUJGLDR8HLBB0107", plate="OH 1933", status="available"),
        Truck(unit_number="T-112", vin="1FUJGLDR8HLBB0112", plate="IN 5501", status="available"),
        Truck(unit_number="T-118", vin="1FUJGLDR8HLBB0118", plate="MI 2209", status="maintenance"),
    ]
    db.add_all(trucks)
    db.flush()

    trailers = [
        Trailer(unit_number="V-501", plate="IL TR 11", status="on_load"),
        Trailer(unit_number="V-508", plate="WI TR 22", status="on_load"),
        Trailer(unit_number="R-220", plate="OH TR 33", status="available"),
        Trailer(unit_number="F-310", plate="IN TR 44", status="available"),
    ]
    db.add_all(trailers)
    db.flush()

    loads = [
        Load(
            reference="MX-10041",
            customer_id=customers[0].id,
            shipper_user_id=amina.id,
            vehicle_type="truck",
            pickup_location="Chicago, IL",
            pickup_window_start=_dt(0, 6),
            delivery_location="Atlanta, GA",
            delivery_window_start=_dt(1, 8),
            commodity="Shop inventory",
            weight_lbs=18400,
            rate=2450,
            status="in_transit",
            driver_id=drivers[0].id,
            truck_id=trucks[0].id,
            trailer_id=trailers[0].id,
            notes="Keep dry. Call on arrival.",
        ),
        Load(
            reference="MX-10042",
            customer_id=customers[1].id,
            vehicle_type="truck",
            pickup_location="Green Bay, WI",
            pickup_window_start=_dt(0, 4),
            delivery_location="Dallas, TX",
            delivery_window_start=_dt(2, 6),
            commodity="Packaged produce",
            weight_lbs=41200,
            rate=3180,
            status="picked_up",
            driver_id=drivers[1].id,
            truck_id=trucks[1].id,
            trailer_id=trailers[1].id,
            notes="Reefer 34F.",
        ),
        Load(
            reference="MX-10043",
            customer_id=customers[0].id,
            shipper_user_id=amina.id,
            vehicle_type="van",
            pickup_location="Chicago, IL",
            pickup_window_start=_dt(0, 10),
            delivery_location="Milwaukee, WI",
            delivery_window_start=_dt(0, 16),
            commodity="Retail boxes",
            weight_lbs=2400,
            rate=280,
            status="open",
            notes="Same-day city run.",
        ),
        Load(
            reference="MX-10044",
            customer_id=customers[3].id,
            vehicle_type="truck",
            pickup_location="Newark, NJ",
            pickup_window_start=_dt(1, 8),
            delivery_location="Charlotte, NC",
            delivery_window_start=_dt(2, 9),
            commodity="Store freight",
            weight_lbs=27600,
            rate=1625,
            status="open",
            notes="Appointment 10:00 at DC door 14.",
        ),
        Load(
            reference="MX-10045",
            customer_id=customers[0].id,
            shipper_user_id=amina.id,
            vehicle_type="bike",
            pickup_location="Loop, Chicago",
            pickup_window_start=_dt(0, 12),
            delivery_location="Hyde Park, Chicago",
            delivery_window_start=_dt(0, 14),
            commodity="Documents and samples",
            weight_lbs=40,
            rate=45,
            status="open",
            notes="Small parcel. Photo POD.",
        ),
        Load(
            reference="MX-10038",
            customer_id=customers[0].id,
            shipper_user_id=amina.id,
            vehicle_type="van",
            pickup_location="Columbus, OH",
            pickup_window_start=_dt(-2, 9),
            delivery_location="Pittsburgh, PA",
            delivery_window_start=_dt(-1, 8),
            commodity="Market fixtures",
            weight_lbs=2100,
            rate=380,
            status="delivered",
            notes="Delivered last week.",
        ),
        Load(
            reference="MX-10046",
            customer_id=customers[2].id,
            vehicle_type="truck",
            pickup_location="Cleveland, OH",
            pickup_window_start=_dt(1, 7),
            delivery_location="Nashville, TN",
            delivery_window_start=_dt(2, 8),
            commodity="Steel coils",
            weight_lbs=44000,
            rate=1890,
            status="open",
            notes="Chains and binders required.",
        ),
        Load(
            reference="MX-10039",
            customer_id=customers[2].id,
            vehicle_type="truck",
            pickup_location="Gary, IN",
            pickup_window_start=_dt(-3, 6),
            delivery_location="Detroit, MI",
            delivery_window_start=_dt(-2, 8),
            commodity="Structural steel",
            weight_lbs=43000,
            rate=1100,
            status="delivered",
            notes="Completed.",
        ),
    ]
    db.add_all(loads)
    db.flush()

    timeline = {
        loads[0].id: [
            ("open", "Amina posted this delivery."),
            ("accepted", "Marcus Webb took the job."),
            ("picked_up", "Picked up in Chicago."),
            ("in_transit", "Rolling south. ETA Atlanta tomorrow."),
        ],
        loads[1].id: [
            ("open", "Produce posted."),
            ("accepted", "Elena Vasquez accepted."),
            ("picked_up", "Loaded Green Bay."),
        ],
        loads[2].id: [("open", "Same-day van run posted.")],
        loads[3].id: [("open", "Harbor Retail needs a truck.")],
        loads[4].id: [("open", "Small parcel. Bike or scooter OK.")],
        loads[5].id: [
            ("open", "Posted."),
            ("accepted", "Driver assigned."),
            ("picked_up", "Picked up Columbus."),
            ("in_transit", "En route."),
            ("delivered", "Delivered Pittsburgh."),
        ],
        loads[6].id: [("open", "Steel job waiting on a truck.")],
        loads[7].id: [
            ("open", "Posted."),
            ("accepted", "Accepted."),
            ("picked_up", "Picked up Gary."),
            ("in_transit", "En route Detroit."),
            ("delivered", "Delivered."),
        ],
    }
    for load_id, events in timeline.items():
        for status, note in events:
            db.add(LoadEvent(load_id=load_id, status=status, note=note, created_by="Mizigox"))

    db.add(Document(load_id=loads[5].id, doc_type="pod", filename="MX-10038-POD.pdf", stored_path=""))
    db.add(Document(load_id=loads[0].id, doc_type="bol", filename="MX-10041-BOL.pdf", stored_path=""))
    db.commit()
