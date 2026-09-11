from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS, UPLOAD_DIR
from app.database import Base, SessionLocal, engine
from app.routers import auth, customers, dashboard, documents, fleet, loads, notifications, search, tracking
from app.schema_migrate import ensure_schema
from app.populate import populate_marketplace
from app.seed import ensure_demo_data, seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    ensure_schema(engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
        ensure_demo_data(db)
        populate_marketplace(db)
    finally:
        db.close()
    yield


app = FastAPI(title="MizigoX Freight", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(customers.router)
app.include_router(fleet.router)
app.include_router(loads.router)
app.include_router(search.router)
app.include_router(notifications.router)
app.include_router(tracking.router)
app.include_router(documents.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "mizigox"}
