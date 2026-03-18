"""
Authentication middleware — Google OAuth2 + JWT with HttpOnly cookies.

Supports two auth modes:
  - HttpOnly cookies (frontend web app)
  - Bearer token header (Chrome extension, API clients)

Usage in routers:
    from app.auth import get_current_user
    @router.get("/protected")
    async def protected(user = Depends(get_current_user)):
        ...
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

# Optional bearer — won't fail if no Authorization header (we check cookie too)
security = HTTPBearer(auto_error=False)

REFRESH_TOKEN_EXPIRE_DAYS = 7


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a short-lived JWT access token (default 60 min)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Create a long-lived JWT refresh token (7 days)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def decode_refresh_token(token: str) -> dict:
    """Decode and validate a refresh token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise JWTError("Not a refresh token")
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        ) from e


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """Extract and validate current user from cookie or Bearer header.

    Auth is temporarily disabled — returns a default user if no token is provided.
    """
    token: str | None = None

    # 1. Try Bearer header (Chrome extension, API clients)
    if credentials:
        token = credentials.credentials

    # 2. Fallback to HttpOnly cookie (web frontend)
    if not token:
        token = request.cookies.get("access_token")

    # 3. Auth disabled: return default user if no token
    if not token:
        return {
            "id": "00000000-0000-0000-0000-000000000000",
            "email": "anonymous@425ppm.fr",
            "role": "user",
        }

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        return {
            "id": "00000000-0000-0000-0000-000000000000",
            "email": "anonymous@425ppm.fr",
            "role": "user",
        }
    return {"id": user_id, "email": payload.get("email"), "role": payload.get("role")}
