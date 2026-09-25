from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Customer, Document, Driver, Load, LoadEvent, Notification, Trailer, Truck, User
from app.pricing import quote_rate, vehicle_info

DEMO = {
    "dispatcher": ("dispatcher@mizigox.com", "dispatcher", "Jordan Hale"),
    "customer": ("hannington@mizigox.com", "cargo", "Hannington"),
    "driver": ("driver@mizigox.com", "driver", "Marcus Webb"),
    "partner": ("partner@mizigox.com", "partner", "Alex Rivera"),
    "transporter": ("transporter@mizigox.com", "transporter", "Eastline Hauliers"),
}


def _dt(days: int, hour: int) -> datetime:
    base = datetime.now().replace(minute=0, second=0, microsecond=0)
    return base + timedelta(days=days, hours=hour - base.hour)


def _quoted(pickup, delivery, tonnes, vehicle, urgency, containers=0):
    q = quote_rate(pickup, delivery, tonnes, vehicle, urgency, containers)
    info = vehicle_info(q["vehicle_type"])
    return {
        "weight_tonnes": q["weight_tonnes"],
        "weight_lbs": round(q["weight_tonnes"] * 2204.62, 2),
        "distance_km": q["distance_km"],
        "rate": q["rate"],
        "currency": q["currency"],
        "trucks_needed": q["trucks_needed"],
        "quote_breakdown": q["breakdown"],
        "truck_spec": info["spec"],
        "vehicle_type": q["vehicle_type"],
        "urgency": q["urgency"],
    }


def seed_if_empty(db: Session) -> None:
    if db.query(User).first():
        return

    customers = [
        Customer(
            name="Hannington Cargo",
            contact="Hannington",
            phone="0772-100-200",
            email="hannington@mizigox.com",
            notes="Client posting steel and container cargo.",
        ),
        Customer(
            name="Lakeside Produce",
            contact="Maya Chen",
            phone="0701-555-198",
            email="shipping@lakesideproduce.example",
            notes="Produce and reefer freight.",
        ),
        Customer(
            name="Northline Steel",
            contact="Chris Novak",
            phone="0702-555-110",
            email="logistics@northlinesteel.example",
            notes="Flatbed / steel.",
        ),
        Customer(
            name="Harbor Retail Co.",
            contact="Priya Shah",
            phone="0703-555-166",
            email="inbound@harborretail.example",
            notes="Store deliveries.",
        ),
    ]
    db.add_all(customers)
    db.flush()

    users_by_email: dict[str, User] = {}

    def add_user(key: str, role: str, driver_id=None):
        email, password, name = DEMO[key]
        user = User(
            email=email,
            hashed_password=hash_password(password),
            name=name,
            phone="0700-000-000",
            role=role,
            driver_id=driver_id,
        )
        db.add(user)
        db.flush()
        users_by_email[email] = user
        return user

    add_user("dispatcher", "dispatcher")
    hannington = add_user("customer", "customer")
    transporter = add_user("transporter", "transporter")
    add_user("partner", "partner")

    drivers = [
        Driver(
            name="Marcus Webb",
            phone="0704-201-440",
            cdl="UG-CDL-8821",
            status="on_load",
            vehicle_type="double_diff",
            owner_user_id=transporter.id,
        ),
        Driver(
            name="Elena Vasquez",
            phone="0704-201-441",
            cdl="KE-CDL-4410",
            status="available",
            vehicle_type="horse_trailer",
            owner_user_id=transporter.id,
        ),
        Driver(
            name="Devon Brooks",
            phone="0704-201-442",
            cdl="UG-CDL-1092",
            status="available",
            vehicle_type="flatbed",
            owner_user_id=transporter.id,
        ),
        Driver(
            name="Samir Patel",
            phone="0704-201-443",
            cdl="KE-CDL-7744",
            status="available",
            vehicle_type="double_diff",
            owner_user_id=transporter.id,
        ),
        Driver(
            name="Riley Thompson",
            phone="0704-201-444",
            cdl="TZ-CDL-3308",
            status="available",
            vehicle_type="box",
            owner_user_id=transporter.id,
        ),
    ]
    db.add_all(drivers)
    db.flush()

    driver_user = User(
        email=DEMO["driver"][0],
        hashed_password=hash_password(DEMO["driver"][1]),
        name=DEMO["driver"][2],
        phone="0704-201-440",
        role="driver",
        driver_id=drivers[0].id,
    )
    db.add(driver_user)
    db.flush()

    trucks = [
        Truck(
            unit_number="T-101",
            vin="1FUJGLDR8HLBB0101",
            plate="UAE 4412",
            status="on_load",
            vehicle_type="double_diff",
            capacity_tonnes=28,
            spec="10-wheeler, double differential, 28 t",
            owner_user_id=transporter.id,
        ),
        Truck(
            unit_number="T-104",
            vin="1FUJGLDR8HLBB0104",
            plate="UAE 8820",
            status="available",
            vehicle_type="double_diff",
            capacity_tonnes=28,
            spec="10-wheeler, double differential, 28 t",
            owner_user_id=transporter.id,
        ),
        Truck(
            unit_number="T-107",
            vin="1FUJGLDR8HLBB0107",
            plate="KBB 1933",
            status="available",
            vehicle_type="horse_trailer",
            capacity_tonnes=32,
            spec="Prime mover with 3-axle trailer",
            owner_user_id=transporter.id,
        ),
        Truck(
            unit_number="T-112",
            vin="1FUJGLDR8HLBB0112",
            plate="UAE 5501",
            status="available",
            vehicle_type="flatbed",
            capacity_tonnes=25,
            spec="Open deck for steel coils",
            owner_user_id=transporter.id,
        ),
        Truck(
            unit_number="T-118",
            vin="1FUJGLDR8HLBB0118",
            plate="TZA 2209",
            status="maintenance",
            vehicle_type="box",
            capacity_tonnes=12,
            spec="Enclosed box body",
            owner_user_id=transporter.id,
        ),
    ]
    db.add_all(trucks)
    db.flush()

    trailers = [
        Trailer(unit_number="V-501", plate="UG TR 11", status="on_load"),
        Trailer(unit_number="V-508", plate="KE TR 22", status="available"),
        Trailer(unit_number="R-220", plate="TZ TR 33", status="available"),
        Trailer(unit_number="F-310", plate="UG TR 44", status="available"),
    ]
    db.add_all(trailers)
    db.flush()

    steel = _quoted("Kampala, UG", "Mombasa, KE", 20, "double_diff", "urgent", 20)
    produce = _quoted("Jinja, UG", "Nairobi, KE", 18, "reefer", "standard", 0)
    retail = _quoted("Kampala, UG", "Mbarara, UG", 8, "box", "same_day", 0)
    coils = _quoted("Jinja, UG", "Kisumu, KE", 24, "flatbed", "standard", 0)
    fixtures = _quoted("Kampala, UG", "Entebbe, UG", 4, "box", "standard", 0)
    transit = _quoted("Kampala, UG", "Nairobi, KE", 22, "horse_trailer", "urgent", 8)

    loads = [
        Load(
            reference="MX-10041",
            customer_id=customers[0].id,
            shipper_user_id=hannington.id,
            transporter_user_id=transporter.id,
            pickup_location="Kampala, UG",
            pickup_window_start=_dt(0, 6),
            delivery_location="Nairobi, KE",
            delivery_window_start=_dt(1, 18),
            commodity="Shop inventory",
            container_count=4,
            trucks_provided=1,
            truck_details="Lead unit T-101, double difference 28 t.",
            status="in_transit",
            driver_id=drivers[0].id,
            truck_id=trucks[0].id,
            trailer_id=trailers[0].id,
            notes="Keep dry. Call on arrival.",
            **transit,
        ),
        Load(
            reference="MX-10047",
            customer_id=customers[0].id,
            shipper_user_id=hannington.id,
            pickup_location="Kampala, UG",
            pickup_window_start=_dt(1, 8),
            delivery_location="Mombasa, KE",
            delivery_window_start=_dt(3, 10),
            commodity="Steel",
            container_count=20,
            trucks_provided=0,
            truck_details="",
            status="posted",
            notes="I, Hannington, have 20 containers of steel worth 20 tonnes. I need a double difference truck. Cargo is packed on the loading date. Handle with urgency.",
            **steel,
        ),
        Load(
            reference="MX-10043",
            customer_id=customers[1].id,
            pickup_location="Jinja, UG",
            pickup_window_start=_dt(0, 10),
            delivery_location="Nairobi, KE",
            delivery_window_start=_dt(1, 16),
            commodity="Packaged produce",
            container_count=0,
            trucks_provided=0,
            status="open",
            notes="Reefer 4C. Admin already sent this to transporters.",
            **produce,
        ),
        Load(
            reference="MX-10044",
            customer_id=customers[3].id,
            pickup_location="Kampala, UG",
            pickup_window_start=_dt(0, 12),
            delivery_location="Mbarara, UG",
            delivery_window_start=_dt(0, 18),
            commodity="Store freight",
            container_count=0,
            trucks_provided=2,
            truck_details="Two box-body trucks committed for same-day retail.",
            transporter_user_id=transporter.id,
            status="accepted",
            notes="Same-day city and highway run.",
            **retail,
        ),
        Load(
            reference="MX-10046",
            customer_id=customers[2].id,
            pickup_location="Jinja, UG",
            pickup_window_start=_dt(1, 7),
            delivery_location="Kisumu, KE",
            delivery_window_start=_dt(1, 20),
            commodity="Steel coils",
            container_count=0,
            trucks_provided=0,
            status="open",
            notes="Chains and binders required.",
            **coils,
        ),
        Load(
            reference="MX-10038",
            customer_id=customers[0].id,
            shipper_user_id=hannington.id,
            transporter_user_id=transporter.id,
            pickup_location="Kampala, UG",
            pickup_window_start=_dt(-2, 9),
            delivery_location="Entebbe, UG",
            delivery_window_start=_dt(-2, 14),
            commodity="Market fixtures",
            container_count=0,
            trucks_provided=1,
            truck_details="Box body delivered yesterday.",
            status="delivered",
            notes="Delivered last week.",
            **fixtures,
        ),
    ]
    db.add_all(loads)
    db.flush()

    timeline = {
        loads[0].id: [
            ("posted", "Hannington posted this delivery."),
            ("open", "Admin sent it to transporters."),
            ("accepted", "Eastline Hauliers accepted and provided T-101."),
            ("accepted", "Marcus Webb took the job."),
            ("picked_up", "Loaded in Kampala."),
            ("in_transit", "Rolling to Nairobi."),
        ],
        loads[1].id: [
            ("posted", "Hannington posted 20 containers of steel, 20 tonnes, double difference truck, urgent loading."),
        ],
        loads[2].id: [
            ("posted", "Produce posted."),
            ("open", "Admin sent this job to all transporters."),
        ],
        loads[3].id: [
            ("posted", "Harbor Retail posted same-day freight."),
            ("open", "Admin sent to transporters."),
            ("accepted", "Eastline Hauliers accepted with 2 box-body trucks. Waiting on a driver."),
        ],
        loads[4].id: [
            ("posted", "Steel coils posted."),
            ("open", "Admin sent to transporters."),
        ],
        loads[5].id: [
            ("posted", "Posted."),
            ("open", "Sent to transporters."),
            ("accepted", "Eastline accepted."),
            ("picked_up", "Loaded Kampala."),
            ("in_transit", "En route Entebbe."),
            ("delivered", "Delivered Entebbe."),
        ],
    }
    for load_id, events in timeline.items():
        for status, note in events:
            db.add(LoadEvent(load_id=load_id, status=status, note=note, created_by="MizigoX"))

    db.add(Document(load_id=loads[5].id, doc_type="pod", filename="MX-10038-POD.pdf", stored_path=""))
    db.add(Document(load_id=loads[0].id, doc_type="bol", filename="MX-10041-BOL.pdf", stored_path=""))

    admin = users_by_email[DEMO["dispatcher"][0]]
    db.add(
        Notification(
            user_id=admin.id,
            load_id=loads[1].id,
            kind="posted",
            title="New cargo posted",
            message="Hannington posted MX-10047: 20 containers of steel, 20 t, Kampala → Mombasa. Send to transporters.",
        )
    )
    db.add(
        Notification(
            user_id=transporter.id,
            load_id=loads[2].id,
            kind="broadcast",
            title="New job from admin",
            message="MX-10043 packaged produce Jinja → Nairobi is open. Provide truck details to take it.",
        )
    )
    db.add(
        Notification(
            user_id=driver_user.id,
            load_id=loads[3].id,
            kind="broadcast",
            title="Trucks ready — take this job",
            message="Eastline covered MX-10044 with 2 trucks. A driver still needs to take the trip.",
        )
    )
    db.commit()


def ensure_demo_data(db: Session) -> None:
    """Fill marketplace accounts and Hannington's steel job on an existing database."""
    email, password, name = DEMO["transporter"]
    transporter = db.query(User).filter(User.email == email).first()
    if not transporter:
        transporter = User(
            email=email,
            hashed_password=hash_password(password),
            name=name,
            phone="0700-300-100",
            role="transporter",
        )
        db.add(transporter)
        db.flush()

    email, password, name = DEMO["customer"]
    client = db.query(User).filter(User.email == email).first()
    if not client:
        client = User(
            email=email,
            hashed_password=hash_password(password),
            name=name,
            phone="0772-100-200",
            role="customer",
        )
        db.add(client)
        db.flush()

    company = db.query(Customer).filter(Customer.email == email).first()
    if not company:
        company = Customer(
            name="Hannington Cargo",
            contact="Hannington",
            phone="0772-100-200",
            email=email,
            notes="Client posting steel and container cargo.",
        )
        db.add(company)
        db.flush()

    for load in db.query(Load).all():
        if not load.weight_tonnes and load.weight_lbs:
            load.weight_tonnes = round(load.weight_lbs / 2204.62, 2)
        if load.status == "booked":
            load.status = "posted"
        if not load.currency:
            load.currency = "USD"
        if not load.urgency:
            load.urgency = "standard"
        if load.vehicle_type in ("truck", "any", ""):
            load.vehicle_type = "double_diff"
        if load.vehicle_type == "van":
            load.vehicle_type = "box"
        if load.vehicle_type == "bike":
            load.vehicle_type = "box"
        if not load.truck_spec:
            load.truck_spec = vehicle_info(load.vehicle_type)["spec"]
        if not load.trucks_needed:
            q = quote_rate(
                load.pickup_location,
                load.delivery_location,
                load.weight_tonnes or 1,
                load.vehicle_type,
                load.urgency,
                load.container_count or 0,
            )
            load.distance_km = q["distance_km"]
            load.trucks_needed = q["trucks_needed"]
            load.quote_breakdown = q["breakdown"]
            if not load.rate:
                load.rate = q["rate"]

    for truck in db.query(Truck).all():
        if not truck.vehicle_type:
            truck.vehicle_type = "double_diff"
        if not truck.capacity_tonnes:
            truck.capacity_tonnes = 28
        if not truck.spec:
            truck.spec = vehicle_info(truck.vehicle_type)["spec"]
        if not truck.owner_user_id:
            truck.owner_user_id = transporter.id

    if not db.query(Load).filter(Load.reference == "MX-10047").first():
        quoted = _quoted("Kampala, UG", "Mombasa, KE", 20, "double_diff", "urgent", 20)
        row = Load(
            reference="MX-10047",
            customer_id=company.id,
            shipper_user_id=client.id,
            pickup_location="Kampala, UG",
            pickup_window_start=_dt(1, 8),
            delivery_location="Mombasa, KE",
            delivery_window_start=_dt(3, 10),
            commodity="Steel",
            container_count=20,
            status="posted",
            notes="I, Hannington, have 20 containers of steel worth 20 tonnes. I need a double difference truck. Cargo is packed on the loading date. Handle with urgency.",
            **quoted,
        )
        db.add(row)
        db.flush()
        db.add(
            LoadEvent(
                load_id=row.id,
                status="posted",
                note="Hannington posted 20 containers of steel, 20 tonnes, double difference truck, urgent loading.",
                created_by="Hannington",
            )
        )
        admin = db.query(User).filter(User.email == DEMO["dispatcher"][0]).first()
        if admin:
            db.add(
                Notification(
                    user_id=admin.id,
                    load_id=row.id,
                    kind="posted",
                    title="New cargo posted",
                    message="Hannington posted MX-10047: 20 containers of steel, 20 t, Kampala → Mombasa. Send to transporters.",
                )
            )

    db.commit()

