import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
)
from app.config import settings
from app.database import get_session
from app.models.user import User
from app.schemas import UserRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def _build_redirect_uri(request: Request) -> str:
    """Build the Google OAuth redirect URI, forcing HTTPS in production."""
    redirect_uri = str(request.url_for("google_callback"))
    # Behind a reverse proxy (Railway), the scheme may resolve to http://
    # even with --proxy-headers. Force https in non-development environments.
    if settings.ENVIRONMENT != "development" and redirect_uri.startswith("http://"):
        redirect_uri = redirect_uri.replace("http://", "https://", 1)
    return redirect_uri


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set HttpOnly auth cookies on a response.

    Uses SameSite=None in production for cross-origin cookie sending
    (Vercel frontend ≠ Railway backend).
    """
    is_prod = settings.ENVIRONMENT != "development"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_prod,
        samesite="none" if is_prod else "lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite="none" if is_prod else "lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    """Clear auth cookies."""
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


@router.get("/google/login")
async def google_login(request: Request):
    """Redirect user to Google OAuth2 consent screen."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    redirect_uri = _build_redirect_uri(request)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    """Handle Google OAuth2 callback — exchange code, upsert user, set cookies."""
    if error:
        logger.error("Google OAuth error: %s", error)
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {error}")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    redirect_uri = _build_redirect_uri(request)
    logger.info("Google callback redirect_uri: %s", redirect_uri)

    # Exchange authorization code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_data = token_resp.json()

        if token_resp.status_code != 200:
            logger.error("Google token exchange failed: %s", token_data)
            raise HTTPException(
                status_code=400,
                detail=f"Failed to exchange code: {token_data.get('error_description', token_data.get('error', 'unknown'))}",
            )

        access_token_google = token_data.get("access_token")
        if not access_token_google:
            logger.error("No access_token in Google response: %s", token_data)
            raise HTTPException(status_code=400, detail="No access_token in Google response")

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token_google}"},
        )
        if userinfo_resp.status_code != 200:
            logger.error("Google userinfo request failed: %s", userinfo_resp.text)
            raise HTTPException(status_code=400, detail="Failed to fetch Google user info")

        userinfo = userinfo_resp.json()

    email = userinfo.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email in Google profile")

    # Upsert user in DB
    try:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                email=email,
                full_name=userinfo.get("name", email),
                role="user",
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
    except Exception:
        logger.exception("Database error during user upsert for %s", email)
        raise HTTPException(status_code=500, detail="Database error during login")

    token_data_jwt = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(data=token_data_jwt)
    refresh_token = create_refresh_token(data=token_data_jwt)
    logger.info("User %s logged in successfully", email)

    # Redirect to frontend with cookies set + token in URL as fallback
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    response = RedirectResponse(f"{frontend_url}/auth/callback?token={access_token}")
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/refresh")
async def refresh_access_token(request: Request):
    """Refresh the access token using the refresh token cookie."""
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_refresh_token(refresh_token)

    token_data_jwt = {
        "sub": payload["sub"],
        "email": payload.get("email"),
        "role": payload.get("role"),
    }
    new_access_token = create_access_token(data=token_data_jwt)
    new_refresh_token = create_refresh_token(data=token_data_jwt)

    response = Response(content='{"ok": true}', media_type="application/json")
    _set_auth_cookies(response, new_access_token, new_refresh_token)
    return response


@router.post("/logout")
async def logout():
    """Clear auth cookies."""
    response = Response(content='{"ok": true}', media_type="application/json")
    _clear_auth_cookies(response)
    return response


@router.get("/me", response_model=UserRead)
async def me(
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return current authenticated user info from DB."""
    result = await session.execute(select(User).where(User.id == user["id"]))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user
