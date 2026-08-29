from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Driver, Trailer, Truck, User
from app.schemas import (
    DriverCreate,
    DriverOut,
    DriverUpdate,
    TrailerCreate,
    TrailerOut,
    TrailerUpdate,
    TruckCreate,
    TruckOut,
    TruckUpdate,
)

router = APIRouter(prefix="/fleet", tags=["fleet"])


def _get_or_404(db: Session, model, item_id: int, label: str):
    row = db.get(model, item_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


@router.get("/drivers", response_model=list[DriverOut])
def list_drivers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Driver).order_by(Driver.name).all()


@router.post("/drivers", response_model=DriverOut, status_code=status.HTTP_201_CREATED)
def create_driver(
    payload: DriverCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = Driver(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/drivers/{driver_id}", response_model=DriverOut)
def update_driver(
    driver_id: int,
    payload: DriverUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = _get_or_404(db, Driver, driver_id, "Driver")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/drivers/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = _get_or_404(db, Driver, driver_id, "Driver")
    if row.loads:
        raise HTTPException(status_code=400, detail="Driver has loads and cannot be deleted")
    db.delete(row)
    db.commit()


@router.get("/trucks", response_model=list[TruckOut])
def list_trucks(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Truck).order_by(Truck.unit_number).all()


@router.post("/trucks", response_model=TruckOut, status_code=status.HTTP_201_CREATED)
def create_truck(
    payload: TruckCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if db.query(Truck).filter(Truck.unit_number == payload.unit_number).first():
        raise HTTPException(status_code=400, detail="Unit number already exists")
    row = Truck(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/trucks/{truck_id}", response_model=TruckOut)
def update_truck(
    truck_id: int,
    payload: TruckUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = _get_or_404(db, Truck, truck_id, "Truck")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/trucks/{truck_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_truck(
    truck_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = _get_or_404(db, Truck, truck_id, "Truck")
    if row.loads:
        raise HTTPException(status_code=400, detail="Truck has loads and cannot be deleted")
    db.delete(row)
    db.commit()


@router.get("/trailers", response_model=list[TrailerOut])
def list_trailers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Trailer).order_by(Trailer.unit_number).all()


@router.post("/trailers", response_model=TrailerOut, status_code=status.HTTP_201_CREATED)
def create_trailer(
    payload: TrailerCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if db.query(Trailer).filter(Trailer.unit_number == payload.unit_number).first():
        raise HTTPException(status_code=400, detail="Unit number already exists")
    row = Trailer(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/trailers/{trailer_id}", response_model=TrailerOut)
def update_trailer(
    trailer_id: int,
    payload: TrailerUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = _get_or_404(db, Trailer, trailer_id, "Trailer")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/trailers/{trailer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trailer(
    trailer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = _get_or_404(db, Trailer, trailer_id, "Trailer")
    if row.loads:
        raise HTTPException(status_code=400, detail="Trailer has loads and cannot be deleted")
    db.delete(row)
    db.commit()
