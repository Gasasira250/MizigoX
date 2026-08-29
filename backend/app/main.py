from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS, UPLOAD_DIR
from app.database import Base, SessionLocal, engine
from app.routers import auth, customers, dashboard, documents, fleet, loads
from app.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Mizigox TMS", version="0.1.0", lifespan=lifespan)

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
app.include_router(documents.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "mizigox"}
