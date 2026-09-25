from math import ceil, cos, radians, sin, sqrt

CURRENCY = "USD"

VEHICLE_TYPES = {
    "double_diff": {
        "label": "Double difference",
        "capacity_tonnes": 28,
        "rate_factor": 1.15,
        "spec": "10-wheeler, double differential, heavy cargo",
    },
    "single_diff": {
        "label": "Single difference",
        "capacity_tonnes": 18,
        "rate_factor": 1.0,
        "spec": "Single differential rigid truck",
    },
    "horse_trailer": {
        "label": "Horse and trailer",
        "capacity_tonnes": 32,
        "rate_factor": 1.25,
        "spec": "Prime mover with semi-trailer",
    },
    "flatbed": {
        "label": "Flatbed",
        "capacity_tonnes": 25,
        "rate_factor": 1.1,
        "spec": "Open deck for steel, timber, and machinery",
    },
    "container": {
        "label": "Container truck",
        "capacity_tonnes": 28,
        "rate_factor": 1.2,
        "spec": "Skeletal or side-loader for containers",
    },
    "tanker": {
        "label": "Tanker",
        "capacity_tonnes": 24,
        "rate_factor": 1.3,
        "spec": "Bulk liquid tanker",
    },
    "reefer": {
        "label": "Reefer",
        "capacity_tonnes": 22,
        "rate_factor": 1.35,
        "spec": "Temperature-controlled body",
    },
    "box": {
        "label": "Box body",
        "capacity_tonnes": 12,
        "rate_factor": 0.9,
        "spec": "Enclosed dry cargo body",
    },
}

URGENCY = {
    "standard": {"label": "Standard", "factor": 1.0},
    "urgent": {"label": "Urgent", "factor": 1.25},
    "same_day": {"label": "Same day", "factor": 1.5},
}

# East African and regional hubs used for distance quotes.
CITIES: dict[str, tuple[float, float]] = {
    "kampala": (0.3476, 32.5825),
    "jinja": (0.4244, 33.2041),
    "mbarara": (-0.6072, 30.6545),
    "gulu": (2.7747, 32.2990),
    "mbale": (1.0820, 34.1750),
    "malaba": (0.6450, 34.2750),
    "entebbe": (0.0600, 32.4469),
    "nairobi": (-1.2921, 36.8219),
    "mombasa": (-4.0435, 39.6682),
    "kisumu": (-0.0917, 34.7680),
    "nakuru": (-0.3031, 36.0800),
    "eldoret": (0.5143, 35.2698),
    "dar es salaam": (-6.7924, 39.2083),
    "dar": (-6.7924, 39.2083),
    "arusha": (-3.3869, 36.6830),
    "kigali": (-1.9441, 30.0619),
    "juba": (4.8594, 31.5713),
    "kisangani": (0.5153, 25.1900),
}

BASE_RATE_PER_KM = 1.35
PER_TONNE_KM = 0.085
MIN_QUOTE = 180
DEFAULT_TREND = 1.0
# Marketplace settlement on the customer quote. Carrier payout is the remainder.
# Applied only in admin/ops responses — customers never see this split.
PLATFORM_TAKE = 0.18


def _city_key(location: str) -> str:
    text = (location or "").lower()
    for name in sorted(CITIES, key=len, reverse=True):
        if name in text:
            return name
    return ""


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (*a, *b))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 6371 * 2 * sqrt(h)


def city_coords(location: str) -> tuple[float, float] | None:
    key = _city_key(location)
    return CITIES.get(key)


def distance_km(pickup: str, delivery: str) -> float:
    a = CITIES.get(_city_key(pickup))
    b = CITIES.get(_city_key(delivery))
    if a and b and a != b:
        return round(_haversine_km(a, b), 1)
    if pickup.strip().lower() == (delivery or "").strip().lower():
        return 35.0
    return 320.0


def vehicle_info(vehicle_type: str) -> dict:
    return VEHICLE_TYPES.get(vehicle_type, VEHICLE_TYPES["double_diff"])


def trucks_for(weight_tonnes: float, vehicle_type: str, container_count: int = 0) -> int:
    info = vehicle_info(vehicle_type)
    _ = container_count
    by_weight = ceil(max(weight_tonnes, 0.1) / info["capacity_tonnes"])
    return max(1, by_weight)


def quote_rate(
    pickup: str,
    delivery: str,
    weight_tonnes: float,
    vehicle_type: str = "double_diff",
    urgency: str = "standard",
    container_count: int = 0,
    trend: float = DEFAULT_TREND,
) -> dict:
    km = distance_km(pickup, delivery)
    info = vehicle_info(vehicle_type)
    urgency_info = URGENCY.get(urgency, URGENCY["standard"])
    tonnes = max(weight_tonnes, 0.1)
    needed = trucks_for(tonnes, vehicle_type, container_count)
    raw = (BASE_RATE_PER_KM * km) + (PER_TONNE_KM * tonnes * km)
    rate = raw * info["rate_factor"] * urgency_info["factor"] * max(trend, 0.7) * needed
    rate = round(max(rate, MIN_QUOTE), 0)
    return {
        "currency": CURRENCY,
        "rate": rate,
        "distance_km": km,
        "weight_tonnes": round(tonnes, 2),
        "trucks_needed": needed,
        "vehicle_type": vehicle_type if vehicle_type in VEHICLE_TYPES else "double_diff",
        "vehicle_label": info["label"],
        "truck_spec": info["spec"],
        "capacity_tonnes": info["capacity_tonnes"],
        "urgency": urgency if urgency in URGENCY else "standard",
        "trend": round(trend, 3),
        "breakdown": (
            f"{km} km × {tonnes} t × {info['label']} × {urgency_info['label']} "
            f"× market {round(trend, 2)} = {CURRENCY} {int(rate):,}"
        ),
    }


def marketplace_economics(customer_rate: float | None) -> dict:
    sell = round(float(customer_rate or 0), 0)
    carrier_cost = round(sell * (1 - PLATFORM_TAKE), 0)
    margin = round(sell - carrier_cost, 0)
    pct = round((margin / sell) * 100, 1) if sell else 0.0
    return {
        "customer_price": sell,
        "carrier_cost": carrier_cost,
        "gross_margin": margin,
        "margin_pct": pct,
    }


def market_trend(db, vehicle_type: str | None = None) -> float:
    from app.models import Load

    query = db.query(Load).filter(Load.status == "delivered", Load.rate > 0, Load.distance_km > 0)
    if vehicle_type:
        query = query.filter(Load.vehicle_type == vehicle_type)
    rows = query.order_by(Load.id.desc()).limit(12).all()
    if len(rows) < 2:
        return DEFAULT_TREND
    expected = []
    actual = []
    for row in rows:
        baseline = quote_rate(
            row.pickup_location,
            row.delivery_location,
            row.weight_tonnes or 1,
            row.vehicle_type,
            row.urgency or "standard",
            row.container_count or 0,
            trend=1.0,
        )
        if baseline["rate"]:
            expected.append(baseline["rate"])
            actual.append(row.rate)
    if not expected:
        return DEFAULT_TREND
    ratio = (sum(actual) / len(actual)) / (sum(expected) / len(expected))
    return max(0.8, min(1.35, ratio))
