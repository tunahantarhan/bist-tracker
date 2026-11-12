"""Authentication: registration, e-mail verification, password reset, sessions and admin 2FA.

Flows
- User:  register -> verify e-mail -> login -> access/refresh tokens
- Admin: admin/login (password) -> short-lived MFA token -> admin/totp (6-digit code)
         -> admin-scoped tokens. The first admin login also enrols the authenticator app.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, oauth2_scheme
from app.core import rate_limit, totp
from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    MFA_PENDING_TOKEN_TYPE,
    PASSWORD_RESET_TOKEN_TYPE,
    REFRESH_TOKEN_TYPE,
    create_session_tokens,
    create_token,
    decode_token,
    get_password_hash,
    password_fingerprint,
    verify_password,
)
from app.models.user import User
from app.schemas.user import (
    AccountDeleteRequest,
    AdminLoginResponse,
    EmailRequest,
    MessageResponse,
    PasswordChangeRequest,
    PasswordResetRequest,
    ProfileUpdate,
    RegisterResponse,
    Token,
    TokenRefreshRequest,
    TokenRequest,
    TotpVerifyRequest,
    UserCreate,
    UserLogin,
    UserResponse,
    VerifyEmailResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Rate-limit windows (seconds)
_15_MIN = 15 * 60
_1_HOUR = 60 * 60
LOGIN_FAILURES_PER_EMAIL = 8
ADMIN_LOGIN_FAILURES_PER_EMAIL = 5
TOTP_FAILURES_PER_USER = 5
PASSWORD_CONFIRM_FAILURES_PER_USER = 5

INVALID_CREDENTIALS = "E-posta adresi veya şifre hatalı."
GENERIC_MAIL_MESSAGE = "Bu adrese kayıtlı bir hesap varsa birkaç dakika içinde e-posta gönderilecek."

# Compared against when the e-mail does not exist, so response time does not reveal
# whether an account is registered.
_DUMMY_HASH = get_password_hash("timing-equalizer-not-a-real-password")


def _issue_tokens(user: User, admin_scope: bool = False) -> dict:
    access, refresh = create_session_tokens(user.id, user.token_version, admin_scope)
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_admin": bool(user.is_admin),
        "admin_session": admin_scope,
    }


async def _get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(func.lower(User.email) == email.lower()))
    return result.scalar_one_or_none()


async def _check_credentials(db: AsyncSession, email: str, password: str) -> User | None:
    user = await _get_user_by_email(db, email)
    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None
    return user if verify_password(password, user.hashed_password) else None


def _ensure_can_sign_in(user: User) -> None:
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hesabınız askıya alınmış.")
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "email_not_verified",
                "message": "Giriş yapabilmek için önce e-posta adresinizi doğrulamanız gerekiyor.",
            },
        )


# ---------------------------------------------------------------------------
# Registration & e-mail verification
# ---------------------------------------------------------------------------


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    await rate_limit.hit(f"register:ip:{rate_limit.client_ip(request)}", 10, _1_HOUR)

    if await _get_user_by_email(db, user_in.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu e-posta adresi zaten kullanılıyor.")

    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        terms_accepted_at=datetime.now(timezone.utc),
        is_verified=False,
    )
    db.add(new_user)
    try:
        await db.commit()
    except IntegrityError:
        # Concurrent registration with the same email
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu e-posta adresi zaten kullanılıyor.") from None
    await db.refresh(new_user)

    background.add_task(auth_service.deliver, *auth_service.verification_email(new_user))
    return {
        "message": "Hesabınız oluşturuldu. Giriş yapmadan önce e-postanıza gönderilen bağlantıyla adresinizi doğrulayın.",
        "email": new_user.email,
    }


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(body: TokenRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit.hit(f"verify:ip:{rate_limit.client_ip(request)}", 30, _15_MIN)

    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "invalid_token", "message": "Doğrulama bağlantısı geçersiz veya süresi dolmuş."},
    )
    claims = decode_token(body.token, EMAIL_VERIFY_TOKEN_TYPE)
    if claims is None:
        raise invalid

    user = await db.get(User, claims["sub"])
    if user is None or user.email != claims.get("email"):
        raise invalid

    if not user.is_verified:
        user.is_verified = True
        await db.commit()
    return {"message": "E-posta adresiniz doğrulandı. Artık giriş yapabilirsiniz.", "email": user.email}


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    body: EmailRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    await rate_limit.hit(f"mail:ip:{rate_limit.client_ip(request)}", 20, _1_HOUR)
    await rate_limit.hit(f"mail:verify:{body.email}", 3, _15_MIN)

    user = await _get_user_by_email(db, body.email)
    if user and user.is_active and not user.is_verified:
        background.add_task(auth_service.deliver, *auth_service.verification_email(user))
    # Same answer whether or not the account exists (no account enumeration)
    return {"message": GENERIC_MAIL_MESSAGE}


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    body: EmailRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    await rate_limit.hit(f"mail:ip:{rate_limit.client_ip(request)}", 20, _1_HOUR)
    await rate_limit.hit(f"mail:reset:{body.email}", 3, _15_MIN)

    user = await _get_user_by_email(db, body.email)
    if user and user.is_active:
        background.add_task(auth_service.deliver, *auth_service.password_reset_email(user))
    return {"message": GENERIC_MAIL_MESSAGE}


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: PasswordResetRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit.hit(f"reset:ip:{rate_limit.client_ip(request)}", 20, _15_MIN)

    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "invalid_token",
            "message": "Sıfırlama bağlantısı geçersiz, süresi dolmuş veya daha önce kullanılmış.",
        },
    )
    claims = decode_token(body.token, PASSWORD_RESET_TOKEN_TYPE)
    if claims is None:
        raise invalid

    user = await db.get(User, claims["sub"])
    # The fingerprint changes with the password, which makes the link single-use
    if user is None or not user.is_active or claims.get("pwd") != password_fingerprint(user.hashed_password):
        raise invalid

    user.hashed_password = get_password_hash(body.password)
    # Opening the link proves ownership of the mailbox
    user.is_verified = True
    # Sign out every existing session
    user.token_version += 1
    await db.commit()
    await rate_limit.reset(f"login:fail:{user.email}")
    return {"message": "Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz."}


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


@router.post("/login", response_model=Token)
async def login(user_in: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    ip = rate_limit.client_ip(request)
    fail_key = f"login:fail:{user_in.email}"
    await rate_limit.hit(f"login:ip:{ip}", 30, _15_MIN)
    await rate_limit.ensure_below(fail_key, LOGIN_FAILURES_PER_EMAIL)

    user = await _check_credentials(db, user_in.email, user_in.password)
    if user is None:
        await rate_limit.record(fail_key, _15_MIN)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS,
            headers={"WWW-Authenticate": "Bearer"},
        )
    _ensure_can_sign_in(user)

    await rate_limit.reset(fail_key)
    auth_service.mark_login(user, ip)
    await db.commit()
    return _issue_tokens(user)


@router.post("/refresh", response_model=Token)
async def refresh_access_token(body: TokenRefreshRequest, db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Oturum süresi doldu, lütfen tekrar giriş yapın.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    claims = decode_token(body.refresh_token, REFRESH_TOKEN_TYPE)
    if claims is None:
        raise credentials_exception

    user = await db.get(User, claims["sub"])
    if not user or not user.is_active or claims.get("ver") != user.token_version:
        raise credentials_exception

    # Admin scope survives a refresh only while the account is still an admin
    return _issue_tokens(user, admin_scope=bool(claims.get("adm")) and bool(user.is_admin))


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Revokes every session of the current user, on all devices."""
    current_user.token_version += 1
    await db.commit()
    return {"message": "Tüm cihazlardaki oturumlarınız kapatıldı."}


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Returns the profile of the currently authenticated user."""
    return current_user


# ---------------------------------------------------------------------------
# Account self-service (profile page)
# ---------------------------------------------------------------------------


async def _confirm_password(user: User, password: str) -> None:
    """Re-checks the password before sensitive account changes, with a per-user failure limit."""
    fail_key = f"pwdconfirm:fail:{user.id}"
    await rate_limit.ensure_below(fail_key, PASSWORD_CONFIRM_FAILURES_PER_USER)
    if not verify_password(password, user.hashed_password):
        await rate_limit.record(fail_key, _15_MIN)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "wrong_password", "message": "Mevcut şifreniz hatalı."},
        )
    await rate_limit.reset(fail_key)


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    body: ProfileUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    current_user.first_name = body.first_name
    current_user.last_name = body.last_name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/change-password", response_model=Token)
async def change_password(
    body: PasswordChangeRequest,
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Changes the password, signs out every other session and returns fresh tokens for this one."""
    await _confirm_password(current_user, body.current_password)
    if verify_password(body.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "same_password", "message": "Yeni şifre mevcut şifrenizle aynı olamaz."},
        )

    current_user.hashed_password = get_password_hash(body.new_password)
    current_user.token_version += 1
    await db.commit()
    # Keep the admin scope only if this session already had it
    claims = decode_token(token, ACCESS_TOKEN_TYPE)
    return _issue_tokens(current_user, admin_scope=bool(claims and claims.get("adm")) and bool(current_user.is_admin))


@router.post("/delete-account", response_model=MessageResponse)
async def delete_account(
    body: AccountDeleteRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Permanently deletes the account; watchlist, alerts and notifications cascade."""
    if current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yönetici hesapları buradan silinemez. Önce yönetici yetkisinin kaldırılması gerekir.",
        )
    await _confirm_password(current_user, body.password)
    await db.execute(delete(User).where(User.id == current_user.id))
    await db.commit()
    return {"message": "Hesabınız ve tüm verileriniz silindi."}


# ---------------------------------------------------------------------------
# Admin sign-in with TOTP two-factor authentication
# ---------------------------------------------------------------------------


@router.post("/admin/login", response_model=AdminLoginResponse)
async def admin_login(user_in: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    ip = rate_limit.client_ip(request)
    fail_key = f"admin_login:fail:{user_in.email}"
    await rate_limit.hit(f"admin_login:ip:{ip}", 10, _15_MIN)
    await rate_limit.ensure_below(fail_key, ADMIN_LOGIN_FAILURES_PER_EMAIL)

    user = await _check_credentials(db, user_in.email, user_in.password)
    if user is None:
        await rate_limit.record(fail_key, _15_MIN)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)
    _ensure_can_sign_in(user)
    if not user.is_admin:
        await rate_limit.record(fail_key, _15_MIN)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu hesabın yönetim paneline erişim yetkisi yok.",
        )
    await rate_limit.reset(fail_key)

    mfa_token = create_token(
        user.id,
        MFA_PENDING_TOKEN_TYPE,
        timedelta(minutes=settings.MFA_PENDING_TOKEN_EXPIRE_MINUTES),
        ver=user.token_version,
    )

    if user.totp_enabled and user.totp_secret:
        return {"status": "totp_required", "mfa_token": mfa_token}

    # First admin sign-in: enrol an authenticator app. The pending secret is kept until
    # a valid code confirms it, so the QR code stays the same across retries.
    if not user.totp_secret:
        user.totp_secret = totp.generate_secret()
        await db.commit()
    return {
        "status": "totp_setup_required",
        "mfa_token": mfa_token,
        "totp_secret": user.totp_secret,
        "otpauth_uri": totp.provisioning_uri(user.totp_secret, user.email, settings.PROJECT_NAME),
    }


@router.post("/admin/totp", response_model=Token)
async def admin_verify_totp(body: TotpVerifyRequest, request: Request, db: AsyncSession = Depends(get_db)):
    expired = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "mfa_expired", "message": "Doğrulama süresi doldu, lütfen tekrar giriş yapın."},
    )
    claims = decode_token(body.mfa_token, MFA_PENDING_TOKEN_TYPE)
    if claims is None:
        raise expired

    user = await db.get(User, claims["sub"])
    if (
        user is None
        or not user.is_active
        or not user.is_admin
        or not user.totp_secret
        or claims.get("ver") != user.token_version
    ):
        raise expired

    fail_key = f"totp:fail:{user.id}"
    await rate_limit.ensure_below(fail_key, TOTP_FAILURES_PER_USER)

    counter = totp.verify(user.totp_secret, body.code, user.totp_last_counter)
    if counter is None:
        await rate_limit.record(fail_key, _15_MIN)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_code", "message": "Doğrulama kodu hatalı veya süresi geçmiş."},
        )

    await rate_limit.reset(fail_key)
    user.totp_enabled = True
    user.totp_last_counter = counter
    auth_service.mark_login(user, rate_limit.client_ip(request))
    await db.commit()
    return _issue_tokens(user, admin_scope=True)
