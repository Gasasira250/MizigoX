from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import Driver, User
from app.roles import ROLES
from app.schemas import RegisterIn, Token, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    role = payload.role if payload.role in ROLES else "customer"
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    driver_id = None
    if role == "driver":
        profile = Driver(name=payload.name, phone=payload.phone, status="available")
        db.add(profile)
        db.flush()
        driver_id = profile.id
    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        name=payload.name,
        phone=payload.phone,
        role=role,
        driver_id=driver_id,
    )
    db.add(user)
    db.commit()
    return Token(access_token=create_access_token(user.email))


@router.post("/login", response_model=Token)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form.username.lower()).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return Token(access_token=create_access_token(user.email))


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current


@router.get("/people", response_model=list[UserOut])
def people(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return (
        db.query(User)
        .filter(User.role.in_(("transporter", "driver", "dispatcher", "partner", "admin", "owner")))
        .order_by(User.role, User.name)
        .all()
    )
