from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response

from app.config import BASE_DIR, CORS_ORIGIN_REGEX, CORS_ORIGINS, UPLOAD_DIR
from app.database import Base, SessionLocal, engine
from app.routers import auth, customers, dashboard, documents, fleet, loads, notifications, search, tracking
from app.schema_migrate import ensure_schema
from app.populate import populate_marketplace
from app.seed import ensure_demo_data, seed_if_empty

FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"


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
    allow_origin_regex=CORS_ORIGIN_REGEX,
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


@app.get("/robots.txt")
def robots(request: Request):
    origin = str(request.base_url).rstrip("/")
    body = f"User-agent: *\nAllow: /\nAllow: /MizigoX/\nSitemap: {origin}/sitemap.xml\n"
    return Response(content=body, media_type="text/plain")


@app.get("/sitemap.xml")
def sitemap(request: Request):
    origin = str(request.base_url).rstrip("/")
    home = f"{origin}/MizigoX/"
    login = f"{origin}/MizigoX/login"
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"<url><loc>{home}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>"
        f"<url><loc>{login}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>"
        "</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


@app.get("/")
def root():
    if (FRONTEND_DIST / "index.html").is_file():
        return RedirectResponse("/MizigoX/")
    return {"ok": True, "service": "mizigox"}


@app.get("/MizigoX")
@app.get("/MizigoX/")
def ui_index():
    index = FRONTEND_DIST / "index.html"
    if not index.is_file():
        return {"detail": "Frontend build missing. Run npm run build in frontend."}
    return FileResponse(index)


@app.get("/MizigoX/{asset_path:path}")
def ui_asset(asset_path: str):
    target = FRONTEND_DIST / asset_path
    if target.is_file():
        return FileResponse(target)
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {"detail": "Not Found"}
