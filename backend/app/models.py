from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40), default="")
    role: Mapped[str] = mapped_column(String(40), default="customer")
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    driver_profile: Mapped["Driver | None"] = relationship(foreign_keys=[driver_id])


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    contact: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    loads: Mapped[list["Load"]] = relationship(back_populates="customer")


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    cdl: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(40), default="available")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    loads: Mapped[list["Load"]] = relationship(back_populates="driver")


class Truck(Base):
    __tablename__ = "trucks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    vin: Mapped[str] = mapped_column(String(40), default="")
    plate: Mapped[str] = mapped_column(String(20), default="")
    status: Mapped[str] = mapped_column(String(40), default="available")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    loads: Mapped[list["Load"]] = relationship(back_populates="truck")


class Trailer(Base):
    __tablename__ = "trailers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    plate: Mapped[str] = mapped_column(String(20), default="")
    status: Mapped[str] = mapped_column(String(40), default="available")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    loads: Mapped[list["Load"]] = relationship(back_populates="trailer")


class Load(Base):
    __tablename__ = "loads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    shipper_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    vehicle_type: Mapped[str] = mapped_column(String(40), default="truck")
    pickup_location: Mapped[str] = mapped_column(String(255))
    pickup_window_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pickup_window_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivery_location: Mapped[str] = mapped_column(String(255))
    delivery_window_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivery_window_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    commodity: Mapped[str] = mapped_column(String(200), default="")
    weight_lbs: Mapped[float] = mapped_column(Float, default=0)
    rate: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(40), default="open", index=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    truck_id: Mapped[int | None] = mapped_column(ForeignKey("trucks.id"), nullable=True)
    trailer_id: Mapped[int | None] = mapped_column(ForeignKey("trailers.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    customer: Mapped["Customer | None"] = relationship(back_populates="loads")
    shipper: Mapped["User | None"] = relationship(foreign_keys=[shipper_user_id])
    driver: Mapped["Driver | None"] = relationship(back_populates="loads")
    truck: Mapped["Truck | None"] = relationship(back_populates="loads")
    trailer: Mapped["Trailer | None"] = relationship(back_populates="loads")
    events: Mapped[list["LoadEvent"]] = relationship(
        back_populates="load", cascade="all, delete-orphan", order_by="LoadEvent.created_at"
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="load", cascade="all, delete-orphan"
    )


class LoadEvent(Base):
    __tablename__ = "load_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    load_id: Mapped[int] = mapped_column(ForeignKey("loads.id"))
    status: Mapped[str] = mapped_column(String(40))
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    load: Mapped["Load"] = relationship(back_populates="events")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    load_id: Mapped[int] = mapped_column(ForeignKey("loads.id"))
    doc_type: Mapped[str] = mapped_column(String(40), default="other")
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    load: Mapped["Load"] = relationship(back_populates="documents")
