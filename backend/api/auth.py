"""
Authentication API routes.
Handles user registration, login, and JWT token management.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from jose import JWTError, jwt
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import settings
from db.database import get_db
from db.tables import User
from models.user import UserRegister, UserLogin, UserResponse, TokenResponse
from core.rate_limit import limiter

router = APIRouter()
security = HTTPBearer()


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency: extract and validate the current user from JWT cookie."""
    token = request.cookies.get("auth_token")
    if not token:
        # Fallback to Authorization header for non-browser clients
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, data: UserRegister, response: Response, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    # Check if email exists
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    user = User(
        email=data.email,
        password_hash=_hash_password(data.password),
        name=data.name,
    )
    db.add(user)
    await db.flush()

    token = _create_token(user.id)
    
    # Set HttpOnly cookie
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        secure=not settings.DEBUG,  # True in prod, False in local dev
        samesite="lax",  # Allow cross-site navigation back to app
        max_age=settings.JWT_EXPIRY_HOURS * 3600,
        path="/",
    )
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            created_at=str(user.created_at),
        ),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, data: UserLogin, response: Response, db: AsyncSession = Depends(get_db)):
    """Login with email and password."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not _verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = _create_token(user.id)
    
    # Set HttpOnly cookie
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.JWT_EXPIRY_HOURS * 3600,
        path="/",
    )
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            created_at=str(user.created_at),
        ),
    )

@router.post("/logout")
async def logout(response: Response):
    """Log out by clearing the HttpOnly cookie."""
    cookie_params = {
        "key": "auth_token",
        "httponly": True,
        "secure": not settings.DEBUG,
        "samesite": "lax",
    }
    # Clear on root (the new standard)
    response.delete_cookie(path="/", **cookie_params)
    # Clear on implicit paths (the old broken state)
    response.delete_cookie(path="/api/auth/login", **cookie_params)
    response.delete_cookie(path="/api/auth", **cookie_params)
    response.delete_cookie(**cookie_params)
    
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Get the current authenticated user."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        created_at=str(user.created_at),
    )


