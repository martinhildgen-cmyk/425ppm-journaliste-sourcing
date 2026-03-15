import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user
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
    """Handle Google OAuth2 callback — exchange code, upsert user, return JWT."""
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

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        }
    )
    logger.info("User %s logged in successfully", email)
    return {"access_token": access_token, "token_type": "bearer"}


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
