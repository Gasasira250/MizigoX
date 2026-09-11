ROLES = ("customer", "driver", "partner", "transporter")


def is_admin(user) -> bool:
    return user.role in ("partner", "dispatcher", "owner", "admin")


def is_partner(user) -> bool:
    return is_admin(user)


def is_transporter(user) -> bool:
    return user.role == "transporter"


def is_driver(user) -> bool:
    return user.role == "driver"


def is_customer(user) -> bool:
    return user.role == "customer"
