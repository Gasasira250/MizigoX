from sqlalchemy.orm import Session

from app.models import Notification, User
from app.roles import is_admin, is_driver, is_transporter


def notify_users(db: Session, users: list[User], *, load_id: int | None, kind: str, title: str, message: str) -> None:
    seen: set[int] = set()
    for user in users:
        if not user or user.id in seen:
            continue
        seen.add(user.id)
        db.add(
            Notification(
                user_id=user.id,
                load_id=load_id,
                kind=kind,
                title=title,
                message=message,
            )
        )


def users_by(db: Session, predicate) -> list[User]:
    return [user for user in db.query(User).all() if predicate(user)]


def notify_admins(db: Session, **kwargs) -> None:
    notify_users(db, users_by(db, is_admin), **kwargs)


def notify_transporters(db: Session, **kwargs) -> None:
    notify_users(db, users_by(db, is_transporter), **kwargs)


def notify_drivers(db: Session, **kwargs) -> None:
    notify_users(db, users_by(db, is_driver), **kwargs)
