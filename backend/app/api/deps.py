from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import ACCESS_TOKEN_TYPE, decode_token
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def _authenticate(token: str, db: AsyncSession) -> tuple[User, dict[str, Any]]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Kimlik doğrulama başarısız veya oturum süresi dolmuş.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    claims = decode_token(token, ACCESS_TOKEN_TYPE)
    if claims is None:
        raise credentials_exception

    user = await db.get(User, claims["sub"])
    # A token_version mismatch means the session was revoked (password reset, suspension...)
    if user is None or not user.is_active or claims.get("ver") != user.token_version:
        raise credentials_exception

    return user, claims


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user, _ = await _authenticate(token, db)
    return user


async def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Requires an admin account *and* an admin-scoped session (issued only after 2FA)."""
    user, claims = await _authenticate(token, db)
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için yönetici yetkisi gerekiyor.",
        )
    if not claims.get("adm"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "admin_session_required",
                "message": "Yönetim paneli için yönetici girişi ve iki adımlı doğrulama gerekiyor.",
            },
        )
    return user
