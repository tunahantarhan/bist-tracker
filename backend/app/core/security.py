"""Password hashing and signed tokens.

Every JWT carries a `token_type` so one kind can never be used in place of another
(e.g. a refresh token as an access token). Session tokens also carry `ver`, the user's
`token_version`: bumping it in the database revokes every session issued before.
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
MFA_PENDING_TOKEN_TYPE = "mfa_pending"
EMAIL_VERIFY_TOKEN_TYPE = "email_verify"
PASSWORD_RESET_TOKEN_TYPE = "password_reset"

# bcrypt only uses the first 72 bytes; truncating explicitly keeps hashes made by
# older passlib/bcrypt versions valid and avoids errors on newer bcrypt releases.
_BCRYPT_MAX_BYTES = 72


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain_password), hashed_password.encode("utf-8"))
    except ValueError:
        # Malformed hash in the database
        return False


def password_fingerprint(hashed_password: str) -> str:
    """Short digest of the current password hash.

    Embedded in password-reset tokens: once the password changes the fingerprint no
    longer matches, so each reset link works only once without a token table.
    """
    return hashlib.sha256(hashed_password.encode("utf-8")).hexdigest()[:16]


def create_token(subject: int | str, token_type: str, expires_delta: timedelta, **claims: Any) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "token_type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        **claims,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict[str, Any] | None:
    """Returns the claims of a valid token of the expected type (with `sub` as int), else None."""
    try:
        payload: dict[str, Any] = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return None

    if payload.get("token_type") != expected_type:
        return None

    try:
        payload["sub"] = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None
    return payload


def create_session_tokens(user_id: int, token_version: int, admin_scope: bool = False) -> tuple[str, str]:
    """Access + refresh pair. `admin_scope` is only granted after the admin 2FA step."""
    claims = {"ver": token_version, "adm": admin_scope}
    refresh_ttl = (
        timedelta(hours=settings.ADMIN_REFRESH_TOKEN_EXPIRE_HOURS)
        if admin_scope
        else timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    access = create_token(
        user_id, ACCESS_TOKEN_TYPE, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), **claims
    )
    refresh = create_token(user_id, REFRESH_TOKEN_TYPE, refresh_ttl, **claims)
    return access, refresh
