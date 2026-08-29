ROLES = ("customer", "driver", "partner")


def is_partner(user) -> bool:
    return user.role in ("partner", "dispatcher", "owner")


def is_driver(user) -> bool:
    return user.role == "driver"


def is_customer(user) -> bool:
    return user.role == "customer"
