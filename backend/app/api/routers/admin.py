from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.models.rule import Rule
from app.models.universe import UniverseStock
from app.models.user import SubscriptionTier, User
from app.schemas.user import AdminUserUpdate

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
        "created_at": u.created_at.strftime("%d.%m.%Y %H:%M") if u.created_at else "--",
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
    }


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.id.desc()))
    return [_serialize_user(u) for u in result.scalars().all()]


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
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin

    await db.commit()
    await db.refresh(user)
    return {"status": "success", "user": _serialize_user(user)}
