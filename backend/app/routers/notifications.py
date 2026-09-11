from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Notification, User
from app.schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    return (
        db.query(Notification)
        .filter(Notification.user_id == current.id)
        .order_by(Notification.id.desc())
        .limit(40)
        .all()
    )


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    row = db.get(Notification, notification_id)
    if not row or row.user_id != current.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.read = True
    db.commit()
    db.refresh(row)
    return row


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current.id,
        Notification.read.is_(False),
    ).update({"read": True})
    db.commit()
    return {"ok": True}
