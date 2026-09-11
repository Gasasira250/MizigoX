from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Customer, Document, Driver, Load, LoadEvent, Notification, Trailer, Truck, User
from app.seed import DEMO, _dt, _quoted


def _get_or_user(db: Session, email: str, password: str, name: str, role: str, **kwargs) -> User:
    row = db.query(User).filter(User.email == email).first()
    if row:
        return row
    row = User(
        email=email,
        hashed_password=hash_password(password),
        name=name,
        phone=kwargs.pop("phone", ""),
        role=role,
        **kwargs,
    )
    db.add(row)
    db.flush()
    return row


def _get_or_customer(db: Session, email: str, name: str, contact: str, phone: str, notes: str) -> Customer:
    row = db.query(Customer).filter(Customer.email == email).first()
    if row:
        return row
    row = Customer(name=name, contact=contact, phone=phone, email=email, notes=notes)
    db.add(row)
    db.flush()
    return row


def _get_or_driver(db: Session, name: str, **kwargs) -> Driver:
    row = db.query(Driver).filter(Driver.name == name).first()
    if row:
        if not row.owner_user_id and kwargs.get("owner_user_id"):
            row.owner_user_id = kwargs["owner_user_id"]
        if kwargs.get("vehicle_type"):
            row.vehicle_type = kwargs["vehicle_type"]
        return row
    row = Driver(name=name, **kwargs)
    db.add(row)
    db.flush()
    return row


def _get_or_truck(db: Session, unit_number: str, **kwargs) -> Truck:
    row = db.query(Truck).filter(Truck.unit_number == unit_number).first()
    if row:
        if not row.owner_user_id and kwargs.get("owner_user_id"):
            row.owner_user_id = kwargs["owner_user_id"]
        if kwargs.get("vehicle_type"):
            row.vehicle_type = kwargs["vehicle_type"]
        if kwargs.get("capacity_tonnes"):
            row.capacity_tonnes = kwargs["capacity_tonnes"]
        if kwargs.get("spec") and not row.spec:
            row.spec = kwargs["spec"]
        return row
    row = Truck(unit_number=unit_number, **kwargs)
    db.add(row)
    db.flush()
    return row


def _get_or_trailer(db: Session, unit_number: str, **kwargs) -> Trailer:
    row = db.query(Trailer).filter(Trailer.unit_number == unit_number).first()
    if row:
        return row
    row = Trailer(unit_number=unit_number, **kwargs)
    db.add(row)
    db.flush()
    return row


def _notify_once(db: Session, user: User | None, load_id: int, kind: str, title: str, message: str) -> None:
    if not user:
        return
    exists = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.load_id == load_id, Notification.kind == kind)
        .first()
    )
    if exists:
        return
    db.add(Notification(user_id=user.id, load_id=load_id, kind=kind, title=title, message=message))


def _add_load(db: Session, reference: str, events: list[tuple[str, str]], **kwargs) -> Load:
    row = db.query(Load).filter(Load.reference == reference).first()
    if row:
        return row
    quoted = kwargs.pop("quoted")
    row = Load(reference=reference, **quoted, **kwargs)
    db.add(row)
    db.flush()
    for status, note in events:
        db.add(LoadEvent(load_id=row.id, status=status, note=note, created_by="MizigoX"))
    return row


def populate_marketplace(db: Session) -> None:
    admin = db.query(User).filter(User.email == DEMO["dispatcher"][0]).first()
    hannington = _get_or_user(db, *DEMO["customer"], "customer", phone="0772-100-200")
    eastline = _get_or_user(db, *DEMO["transporter"], "transporter", phone="0700-300-100")
    rift = _get_or_user(
        db, "rift@mizigox.com", "transporter", "Rift Valley Logistics", "transporter", phone="0708-220-110"
    )
    nile = _get_or_user(
        db, "nile@mizigox.com", "transporter", "Nile Cargo Ltd", "transporter", phone="0708-220-220"
    )

    hannington_co = _get_or_customer(
        db, "hannington@mizigox.com", "Hannington Cargo", "Hannington", "0772-100-200", "Steel and container cargo."
    )
    lakeside = _get_or_customer(
        db, "shipping@lakesideproduce.example", "Lakeside Produce", "Maya Chen", "0701-555-198", "Produce and reefer."
    )
    northline = _get_or_customer(
        db, "logistics@northlinesteel.example", "Northline Steel", "Chris Novak", "0702-555-110", "Flatbed / steel."
    )
    harbor = _get_or_customer(
        db, "inbound@harborretail.example", "Harbor Retail Co.", "Priya Shah", "0703-555-166", "Store deliveries."
    )
    kakira = _get_or_customer(
        db, "logistics@kakira.example", "Kakira Sugar", "Aisha Namara", "0705-441-200", "Bagged sugar and molasses."
    )
    cement = _get_or_customer(
        db, "dispatch@kampalacement.example", "Kampala Cement", "Peter Okello", "0705-441-310", "Bagged cement and clinker."
    )
    timber = _get_or_customer(
        db, "yard@bugandatimber.example", "Buganda Timber", "Joseph Ssemakula", "0705-441-420", "Sawn timber and poles."
    )
    fresh = _get_or_customer(
        db, "export@freshnile.example", "Fresh Nile Exporters", "Grace Atim", "0705-441-530", "Fresh produce for export."
    )

    marcus = _get_or_driver(
        db, "Marcus Webb", phone="0704-201-440", cdl="UG-CDL-8821", status="on_load",
        vehicle_type="double_diff", owner_user_id=eastline.id,
    )
    elena = _get_or_driver(
        db, "Elena Vasquez", phone="0704-201-441", cdl="KE-CDL-4410", status="on_load",
        vehicle_type="horse_trailer", owner_user_id=eastline.id,
    )
    devon = _get_or_driver(
        db, "Devon Brooks", phone="0704-201-442", cdl="UG-CDL-1092", status="on_load",
        vehicle_type="flatbed", owner_user_id=eastline.id,
    )
    _get_or_driver(
        db, "Samir Patel", phone="0704-201-443", cdl="KE-CDL-7744", status="available",
        vehicle_type="double_diff", owner_user_id=eastline.id,
    )
    _get_or_driver(
        db, "Riley Thompson", phone="0704-201-444", cdl="TZ-CDL-3308", status="available",
        vehicle_type="box", owner_user_id=eastline.id,
    )
    moses = _get_or_driver(
        db, "Moses Wekesa", phone="0708-301-101", cdl="KE-CDL-2291", status="on_load",
        vehicle_type="tanker", owner_user_id=rift.id,
    )
    joan = _get_or_driver(
        db, "Joan Chebet", phone="0708-301-102", cdl="KE-CDL-2292", status="available",
        vehicle_type="reefer", owner_user_id=rift.id,
    )
    _get_or_driver(
        db, "Paul Onyango", phone="0708-301-103", cdl="KE-CDL-2293", status="available",
        vehicle_type="container", owner_user_id=rift.id,
    )
    fatima = _get_or_driver(
        db, "Fatima Nalubega", phone="0708-401-201", cdl="UG-CDL-5510", status="available",
        vehicle_type="double_diff", owner_user_id=nile.id,
    )
    isaac = _get_or_driver(
        db, "Isaac Mugisha", phone="0708-401-202", cdl="UG-CDL-5511", status="on_load",
        vehicle_type="horse_trailer", owner_user_id=nile.id,
    )

    _get_or_user(db, *DEMO["driver"], "driver", phone="0704-201-440", driver_id=marcus.id)
    _get_or_user(db, "elena@mizigox.com", "driver", "Elena Vasquez", "driver", phone="0704-201-441", driver_id=elena.id)
    _get_or_user(db, "joan@mizigox.com", "driver", "Joan Chebet", "driver", phone="0708-301-102", driver_id=joan.id)
    _get_or_user(db, "fatima@mizigox.com", "driver", "Fatima Nalubega", "driver", phone="0708-401-201", driver_id=fatima.id)

    t101 = _get_or_truck(db, "T-101", vin="UGDD101", plate="UAE 4412", status="on_load", vehicle_type="double_diff", capacity_tonnes=28, spec="10-wheeler, double differential, 28 t", owner_user_id=eastline.id)
    t107 = _get_or_truck(db, "T-107", vin="UGHT107", plate="KBB 1933", status="on_load", vehicle_type="horse_trailer", capacity_tonnes=32, spec="Prime mover with 3-axle trailer", owner_user_id=eastline.id)
    t112 = _get_or_truck(db, "T-112", vin="UGFB112", plate="UAE 5501", status="on_load", vehicle_type="flatbed", capacity_tonnes=25, spec="Open deck for steel coils", owner_user_id=eastline.id)
    _get_or_truck(db, "T-104", vin="UGDD104", plate="UAE 8820", status="available", vehicle_type="double_diff", capacity_tonnes=28, spec="10-wheeler, double differential, 28 t", owner_user_id=eastline.id)
    _get_or_truck(db, "T-118", vin="UGBX118", plate="TZA 2209", status="maintenance", vehicle_type="box", capacity_tonnes=12, spec="Enclosed box body", owner_user_id=eastline.id)
    _get_or_truck(db, "T-121", vin="UGDD121", plate="UAE 6610", status="available", vehicle_type="double_diff", capacity_tonnes=28, spec="Double difference 10-wheeler", owner_user_id=eastline.id)
    _get_or_truck(db, "T-125", vin="UGDD125", plate="UAE 6611", status="available", vehicle_type="double_diff", capacity_tonnes=28, spec="Double difference 10-wheeler", owner_user_id=eastline.id)
    rv201 = _get_or_truck(db, "RV-201", vin="KETK201", plate="KDA 201A", status="on_load", vehicle_type="tanker", capacity_tonnes=24, spec="Fuel tanker 24 t", owner_user_id=rift.id)
    _get_or_truck(db, "RV-205", vin="KERF205", plate="KDA 205B", status="available", vehicle_type="reefer", capacity_tonnes=22, spec="Reefer 4C", owner_user_id=rift.id)
    _get_or_truck(db, "RV-210", vin="KECT210", plate="KDA 210C", status="available", vehicle_type="container", capacity_tonnes=28, spec="Skeletal container truck", owner_user_id=rift.id)
    _get_or_truck(db, "RV-214", vin="KEDD214", plate="KDA 214D", status="available", vehicle_type="double_diff", capacity_tonnes=28, spec="Double difference 28 t", owner_user_id=rift.id)
    _get_or_truck(db, "NC-301", vin="UGNC301", plate="UBB 301", status="available", vehicle_type="double_diff", capacity_tonnes=28, spec="Double difference 28 t", owner_user_id=nile.id)
    nc305 = _get_or_truck(db, "NC-305", vin="UGNC305", plate="UBB 305", status="on_load", vehicle_type="horse_trailer", capacity_tonnes=32, spec="Horse and trailer 32 t", owner_user_id=nile.id)
    _get_or_truck(db, "NC-308", vin="UGNC308", plate="UBB 308", status="available", vehicle_type="flatbed", capacity_tonnes=25, spec="Timber flatbed", owner_user_id=nile.id)
    nc312 = _get_or_truck(db, "NC-312", vin="UGNC312", plate="UBB 312", status="available", vehicle_type="box", capacity_tonnes=12, spec="Box body city truck", owner_user_id=nile.id)

    tr501 = _get_or_trailer(db, "V-501", plate="UG TR 11", status="on_load")
    _get_or_trailer(db, "V-508", plate="KE TR 22", status="available")
    _get_or_trailer(db, "R-220", plate="TZ TR 33", status="available")
    _get_or_trailer(db, "F-310", plate="UG TR 44", status="available")
    tr401 = _get_or_trailer(db, "TK-401", plate="KE TK 01", status="on_load")
    tr510 = _get_or_trailer(db, "HT-510", plate="UG HT 10", status="on_load")

    posted_steel = _add_load(
        db, "MX-10047",
        [("posted", "Hannington posted 20 containers of steel, 20 tonnes, double difference truck, urgent loading.")],
        customer_id=hannington_co.id, shipper_user_id=hannington.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(1, 8),
        delivery_location="Mombasa, KE", delivery_window_start=_dt(3, 10),
        commodity="Steel", container_count=20, status="posted",
        notes="I, Hannington, have 20 containers of steel worth 20 tonnes. I need a double difference truck. Cargo is packed on the loading date. Handle with urgency.",
        quoted=_quoted("Kampala, UG", "Mombasa, KE", 20, "double_diff", "urgent", 20),
    )
    cement_job = _add_load(
        db, "MX-20001",
        [("posted", "Kampala Cement posted 40 t of bagged cement. Needs 2 double difference trucks.")],
        customer_id=cement.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(1, 6),
        delivery_location="Gulu, UG", delivery_window_start=_dt(1, 18),
        commodity="Bagged cement", container_count=0, status="posted",
        notes="40 tonnes of bagged cement. Packed at the plant. Loading 06:00. Urgent because the Gulu depot is empty.",
        quoted=_quoted("Kampala, UG", "Gulu, UG", 40, "double_diff", "urgent", 0),
    )
    timber_job = _add_load(
        db, "MX-20002",
        [("posted", "Buganda Timber posted poles and sawn timber for Mbarara.")],
        customer_id=timber.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(2, 7),
        delivery_location="Mbarara, UG", delivery_window_start=_dt(2, 16),
        commodity="Sawn timber", container_count=0, status="posted",
        notes="Need a flatbed. Poles must be chained. Loading date is in two days.",
        quoted=_quoted("Kampala, UG", "Mbarara, UG", 18, "flatbed", "standard", 0),
    )
    tea_job = _add_load(
        db, "MX-20003",
        [("posted", "Fresh Nile posted tea for Mombasa export."), ("open", "Admin sent to every transporter.")],
        customer_id=fresh.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(1, 5),
        delivery_location="Mombasa, KE", delivery_window_start=_dt(3, 8),
        commodity="Tea chests", container_count=8, status="open",
        notes="Keep dry. Export booking at Mombasa port day 3.",
        quoted=_quoted("Kampala, UG", "Mombasa, KE", 22, "container", "urgent", 8),
    )
    sugar_job = _add_load(
        db, "MX-20004",
        [("posted", "Kakira posted bagged sugar."), ("open", "Admin sent to transporters.")],
        customer_id=kakira.id,
        pickup_location="Jinja, UG", pickup_window_start=_dt(0, 8),
        delivery_location="Kigali, RW", delivery_window_start=_dt(1, 20),
        commodity="Bagged sugar", status="open",
        notes="28 tonnes. Horse and trailer preferred.",
        quoted=_quoted("Jinja, UG", "Kigali, RW", 26, "horse_trailer", "standard", 0),
    )
    _add_load(
        db, "MX-10043",
        [("posted", "Produce posted."), ("open", "Admin sent this job to all transporters.")],
        customer_id=lakeside.id,
        pickup_location="Jinja, UG", pickup_window_start=_dt(0, 10),
        delivery_location="Nairobi, KE", delivery_window_start=_dt(1, 16),
        commodity="Packaged produce", status="open",
        notes="Reefer 4C. Admin already sent this to transporters.",
        quoted=_quoted("Jinja, UG", "Nairobi, KE", 18, "reefer", "standard", 0),
    )
    _add_load(
        db, "MX-10046",
        [("posted", "Steel coils posted."), ("open", "Admin sent to transporters.")],
        customer_id=northline.id,
        pickup_location="Jinja, UG", pickup_window_start=_dt(1, 7),
        delivery_location="Kisumu, KE", delivery_window_start=_dt(1, 20),
        commodity="Steel coils", status="open",
        notes="Chains and binders required.",
        quoted=_quoted("Jinja, UG", "Kisumu, KE", 24, "flatbed", "standard", 0),
    )
    retail_job = _add_load(
        db, "MX-10044",
        [
            ("posted", "Harbor Retail posted same-day freight."),
            ("open", "Admin sent to transporters."),
            ("accepted", "Eastline Hauliers accepted with 2 box-body trucks. Waiting on a driver."),
        ],
        customer_id=harbor.id, transporter_user_id=eastline.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(0, 12),
        delivery_location="Mbarara, UG", delivery_window_start=_dt(0, 18),
        commodity="Store freight", trucks_provided=2,
        truck_details="2 box-body trucks committed. Driver still needed.",
        status="accepted",
        notes="Same-day city and highway run.",
        quoted=_quoted("Kampala, UG", "Mbarara, UG", 8, "box", "same_day", 0),
    )
    hannington_boxes = _add_load(
        db, "MX-20005",
        [
            ("posted", "Hannington posted shop stock for Mbale."),
            ("open", "Admin sent to transporters."),
            ("accepted", "Nile Cargo Ltd accepted with 1 box body NC-312."),
        ],
        customer_id=hannington_co.id, shipper_user_id=hannington.id, transporter_user_id=nile.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(0, 14),
        delivery_location="Mbale, UG", delivery_window_start=_dt(0, 20),
        commodity="Shop inventory", trucks_provided=1,
        truck_details="1 box-body truck NC-312, 12 t. Driver Fatima can take it.",
        truck_id=nc312.id, status="accepted",
        notes="Packed today. Need it in Mbale before close of business.",
        quoted=_quoted("Kampala, UG", "Mbale, UG", 6, "box", "same_day", 0),
    )
    transit = _add_load(
        db, "MX-10041",
        [
            ("posted", "Hannington posted this delivery."),
            ("open", "Admin sent it to transporters."),
            ("accepted", "Eastline Hauliers accepted and provided T-101."),
            ("accepted", "Marcus Webb took the job."),
            ("picked_up", "Loaded in Kampala."),
            ("in_transit", "Rolling to Nairobi."),
        ],
        customer_id=hannington_co.id, shipper_user_id=hannington.id, transporter_user_id=eastline.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(0, 6),
        delivery_location="Nairobi, KE", delivery_window_start=_dt(1, 18),
        commodity="Shop inventory", container_count=4, trucks_provided=1,
        truck_details="Lead unit T-101, double difference 28 t.",
        status="in_transit", driver_id=marcus.id, truck_id=t101.id, trailer_id=tr501.id,
        notes="Keep dry. Call on arrival.",
        quoted=_quoted("Kampala, UG", "Nairobi, KE", 22, "horse_trailer", "urgent", 8),
    )
    fuel = _add_load(
        db, "MX-20006",
        [
            ("posted", "Kakira posted molasses tanker."),
            ("open", "Admin sent to transporters."),
            ("accepted", "Rift Valley Logistics provided tanker RV-201."),
            ("accepted", "Moses Wekesa took the job."),
            ("picked_up", "Loaded at Kakira."),
            ("in_transit", "Heading to Eldoret."),
        ],
        customer_id=kakira.id, transporter_user_id=rift.id,
        pickup_location="Jinja, UG", pickup_window_start=_dt(0, 5),
        delivery_location="Eldoret, KE", delivery_window_start=_dt(1, 12),
        commodity="Molasses", trucks_provided=1,
        truck_details="1 tanker RV-201, 24 t, driver Moses Wekesa.",
        status="in_transit", driver_id=moses.id, truck_id=rv201.id, trailer_id=tr401.id,
        notes="Food-grade tanker. Do not mix loads.",
        quoted=_quoted("Jinja, UG", "Eldoret, KE", 24, "tanker", "urgent", 0),
    )
    _add_load(
        db, "MX-20007",
        [
            ("posted", "Kampala Cement posted clinker to Nairobi."),
            ("open", "Admin sent to transporters."),
            ("accepted", "Nile Cargo provided horse and trailer NC-305."),
            ("accepted", "Isaac Mugisha took the job."),
            ("picked_up", "Loaded at the plant."),
            ("in_transit", "En route Nairobi."),
        ],
        customer_id=cement.id, transporter_user_id=nile.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(0, 4),
        delivery_location="Nairobi, KE", delivery_window_start=_dt(1, 16),
        commodity="Clinker", trucks_provided=1,
        truck_details="Horse and trailer NC-305, 32 t, driver Isaac Mugisha.",
        status="in_transit", driver_id=isaac.id, truck_id=nc305.id, trailer_id=tr510.id,
        notes="Cover with tarpaulin. Weighbridge ticket required.",
        quoted=_quoted("Kampala, UG", "Nairobi, KE", 30, "horse_trailer", "standard", 0),
    )
    _add_load(
        db, "MX-20008",
        [
            ("posted", "Northline posted structural steel."),
            ("open", "Admin sent to transporters."),
            ("accepted", "Eastline provided flatbed T-112."),
            ("accepted", "Devon Brooks took the job."),
            ("picked_up", "Loaded in Jinja. Chains on."),
        ],
        customer_id=northline.id, transporter_user_id=eastline.id,
        pickup_location="Jinja, UG", pickup_window_start=_dt(0, 7),
        delivery_location="Malaba, UG", delivery_window_start=_dt(0, 15),
        commodity="Structural steel", trucks_provided=1,
        truck_details="Flatbed T-112, 25 t, driver Devon Brooks.",
        status="picked_up", driver_id=devon.id, truck_id=t112.id,
        notes="Oversize beams. Police escort not required.",
        quoted=_quoted("Jinja, UG", "Malaba, UG", 22, "flatbed", "urgent", 0),
    )
    _add_load(
        db, "MX-20009",
        [
            ("posted", "Fresh Nile posted avocados."),
            ("open", "Admin sent to transporters."),
            ("accepted", "Eastline provided horse and trailer T-107."),
            ("accepted", "Elena Vasquez took the job."),
            ("picked_up", "Loaded Entebbe cold store."),
        ],
        customer_id=fresh.id, transporter_user_id=eastline.id,
        pickup_location="Entebbe, UG", pickup_window_start=_dt(0, 3),
        delivery_location="Nairobi, KE", delivery_window_start=_dt(1, 10),
        commodity="Avocados", container_count=2, trucks_provided=1,
        truck_details="Horse and trailer T-107, driver Elena Vasquez.",
        status="picked_up", driver_id=elena.id, truck_id=t107.id,
        notes="Keep cool. Photo POD at the packhouse.",
        quoted=_quoted("Entebbe, UG", "Nairobi, KE", 16, "reefer", "urgent", 2),
    )
    delivered_a = _add_load(
        db, "MX-10038",
        [
            ("posted", "Posted."),
            ("open", "Sent to transporters."),
            ("accepted", "Eastline accepted."),
            ("picked_up", "Loaded Kampala."),
            ("in_transit", "En route Entebbe."),
            ("delivered", "Delivered Entebbe."),
        ],
        customer_id=hannington_co.id, shipper_user_id=hannington.id, transporter_user_id=eastline.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(-2, 9),
        delivery_location="Entebbe, UG", delivery_window_start=_dt(-2, 14),
        commodity="Market fixtures", trucks_provided=1,
        truck_details="Box body delivered.",
        status="delivered",
        notes="Delivered last week.",
        quoted=_quoted("Kampala, UG", "Entebbe, UG", 4, "box", "standard", 0),
    )
    delivered_b = _add_load(
        db, "MX-20010",
        [
            ("posted", "Harbor Retail posted Nakuru stock."),
            ("open", "Sent to transporters."),
            ("accepted", "Rift Valley accepted."),
            ("picked_up", "Loaded Kampala."),
            ("in_transit", "En route Nakuru."),
            ("delivered", "Delivered Nakuru DC."),
        ],
        customer_id=harbor.id, transporter_user_id=rift.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(-4, 8),
        delivery_location="Nakuru, KE", delivery_window_start=_dt(-3, 16),
        commodity="Store freight", trucks_provided=1,
        truck_details="Container truck RV-210 completed the lane.",
        status="delivered",
        notes="Completed.",
        quoted=_quoted("Kampala, UG", "Nakuru, KE", 14, "container", "standard", 2),
    )
    _add_load(
        db, "MX-20011",
        [
            ("posted", "Hannington posted maize to Kisumu."),
            ("open", "Sent out."),
            ("accepted", "Nile Cargo accepted."),
            ("picked_up", "Loaded."),
            ("in_transit", "En route."),
            ("delivered", "Delivered Kisumu mill."),
        ],
        customer_id=hannington_co.id, shipper_user_id=hannington.id, transporter_user_id=nile.id,
        pickup_location="Kampala, UG", pickup_window_start=_dt(-6, 6),
        delivery_location="Kisumu, KE", delivery_window_start=_dt(-5, 17),
        commodity="Maize", trucks_provided=1,
        truck_details="Double difference NC-301.",
        status="delivered",
        notes="Completed last week.",
        quoted=_quoted("Kampala, UG", "Kisumu, KE", 28, "double_diff", "standard", 0),
    )

    if not db.query(Document).filter(Document.filename == "MX-10038-POD.pdf").first():
        db.add(Document(load_id=delivered_a.id, doc_type="pod", filename="MX-10038-POD.pdf", stored_path=""))
    if not db.query(Document).filter(Document.filename == "MX-10041-BOL.pdf").first():
        db.add(Document(load_id=transit.id, doc_type="bol", filename="MX-10041-BOL.pdf", stored_path=""))
    if not db.query(Document).filter(Document.filename == "MX-20010-POD.pdf").first():
        db.add(Document(load_id=delivered_b.id, doc_type="pod", filename="MX-20010-POD.pdf", stored_path=""))

    _notify_once(db, admin, posted_steel.id, "posted", "New cargo posted", "Hannington posted MX-10047: 20 containers of steel, 20 t, Kampala → Mombasa. Send to transporters.")
    _notify_once(db, admin, cement_job.id, "posted", "New cargo posted", "Kampala Cement posted 40 t bagged cement Kampala → Gulu. Needs double difference trucks.")
    _notify_once(db, admin, timber_job.id, "posted", "New cargo posted", "Buganda Timber posted sawn timber Kampala → Mbarara. Flatbed required.")
    for company in (eastline, rift, nile):
        _notify_once(db, company, tea_job.id, "broadcast", "New job from admin", "MX-20003 tea chests Kampala → Mombasa is open. Container truck needed.")
        _notify_once(db, company, sugar_job.id, "broadcast", "New job from admin", "MX-20004 bagged sugar Jinja → Kigali is open. Horse and trailer preferred.")
        _notify_once(db, company, hannington_boxes.id, "driver_assigned", "Driver still needed", "Nile Cargo covered MX-20005 (Hannington shop stock). Confirm when a driver takes it.")
    driver_user = db.query(User).filter(User.email == DEMO["driver"][0]).first()
    _notify_once(db, driver_user, retail_job.id, "broadcast", "Trucks ready — take this job", "Eastline covered MX-10044 with 2 trucks. A driver still needs to take the trip.")
    _notify_once(db, driver_user, hannington_boxes.id, "broadcast", "Trucks ready — take this job", "Nile Cargo covered MX-20005 Kampala → Mbale. Take the job if you are free.")
    _notify_once(db, hannington, hannington_boxes.id, "accepted", "Transporter accepted", "Nile Cargo Ltd accepted your Mbale shop stock and provided box-body NC-312.")
    _notify_once(db, hannington, transit.id, "driver_assigned", "Driver accepted the job", "Marcus Webb accepted MX-10041 and is on the way to Nairobi.")
    db.commit()
