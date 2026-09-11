import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_URL = f"sqlite:///{BASE_DIR / 'mizigox.db'}"
UPLOAD_DIR = BASE_DIR / "uploads"
SECRET_KEY = os.getenv("SECRET_KEY", "mizigox-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "https://gasasira250.github.io",
]
CORS_ORIGINS += [item.strip() for item in os.getenv("CORS_ORIGINS", "").split(",") if item.strip()]
CORS_ORIGIN_REGEX = r"https://.*\.(onrender\.com|railway\.app|fly\.dev)"
