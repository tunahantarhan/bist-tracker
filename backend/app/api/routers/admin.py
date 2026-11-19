import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.rule import Rule
from app.models.universe import UniverseStock
from app.models.user import SubscriptionTier, User
from app.providers.quotes import quote_book
from app.providers.yahoo_gateway import gateway
from app.providers.yfinance_provider import provider_stats
from app.schemas.user import AdminUserInvite, AdminUserUpdate
from app.services import auth_service
from app.services.market_service import scan_stats

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(get_current_admin)])


def _serialize_user(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "first_name": u.first_name or "",
        "last_name": u.last_name or "",
        "tier": u.tier.value if isinstance(u.tier, SubscriptionTier) else str(u.tier or "FREE"),
        "is_admin": bool(u.is_admin),
        "is_active": bool(u.is_active),
        "is_verified": bool(u.is_verified),
        "totp_enabled": bool(u.totp_enabled),
        "created_at": u.created_at.strftime("%d.%m.%Y %H:%M") if u.created_at else "--",
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
    }


@router.get("/stats")
async def get_admin_stats(db: AsyncSession = Depends(get_db)):
    """Platform metrics for the admin header chips."""
    total_users = await db.scalar(select(func.count()).select_from(User))
    active_stocks = await db.scalar(
        select(func.count()).select_from(UniverseStock).where(UniverseStock.is_active.is_(True))
    )
    active_rules = await db.scalar(select(func.count()).select_from(Rule).where(Rule.is_active.is_(True)))
    return {
        "total_users": total_users or 0,
        "active_stocks": active_stocks or 0,
        "active_rules": active_rules or 0,
        "data_pipeline": {
            **gateway.stats(),
            **quote_book.stats(),
            **provider_stats(),
            **scan_stats(),
        },
    }


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.id.desc()))
    return [_serialize_user(u) for u in result.scalars().all()]


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def invite_user(payload: AdminUserInvite, background: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Creates an account for someone else (e.g. the domain consultant) so they receive the
    system alerts by e-mail. The address is vouched for by the admin, so it is verified; a
    random password is set and the person chooses their own from the invitation link."""
    exists = await db.scalar(select(User.id).where(User.email == payload.email))
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu e-posta adresi zaten kullanılıyor.")

    user = User(
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        hashed_password=get_password_hash(secrets.token_urlsafe(32)),
        is_verified=True,
        terms_accepted_at=datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu e-posta adresi zaten kullanılıyor.") from None
    await db.refresh(user)
    background.add_task(auth_service.deliver, *auth_service.invite_email(user))
    return {"status": "success", "user": _serialize_user(user)}


@router.post("/users/{user_id}/resend-invite")
async def resend_invite(user_id: int, background: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kullanıcı bulunamadı")
    if user.last_login_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kullanıcı zaten giriş yapmış.")
    background.add_task(auth_service.deliver, *auth_service.invite_email(user))
    return {"status": "success"}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kullanıcı bulunamadı")

    # Prevent an admin from locking themselves out
    if user.id == current_admin.id and (payload.is_admin is False or payload.is_active is False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kendi yönetici yetkinizi veya hesabınızı kapatamazsınız.",
        )

    if payload.tier is not None:
        try:
            user.tier = SubscriptionTier(payload.tier.upper())
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz paket türü") from None
    revoke_sessions = False
    if payload.is_active is not None and payload.is_active != user.is_active:
        user.is_active = payload.is_active
        revoke_sessions = revoke_sessions or not payload.is_active
    if payload.is_admin is not None and payload.is_admin != user.is_admin:
        user.is_admin = payload.is_admin
        if not payload.is_admin:
            # A demoted admin must enrol again if promoted later
            user.totp_secret = None
            user.totp_enabled = False
            user.totp_last_counter = None
            revoke_sessions = True
    if revoke_sessions:
        # Suspended or demoted accounts lose their open sessions immediately
        user.token_version += 1

    await db.commit()
    await db.refresh(user)
    return {"status": "success", "user": _serialize_user(user)}


@router.post("/users/{user_id}/reset-2fa")
async def reset_user_2fa(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Clears another admin's authenticator (e.g. lost phone); they enrol again on next sign-in."""
    if user_id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kendi iki adımlı doğrulamanızı sıfırlayamazsınız.")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kullanıcı bulunamadı")

    user.totp_secret = None
    user.totp_enabled = False
    user.totp_last_counter = None
    user.token_version += 1
    await db.commit()
    await db.refresh(user)
    return {"status": "success", "user": _serialize_user(user)}
