import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import SubscriptionTier, User
from app.models.watchlist import Watchlist

router = APIRouter(prefix="/watchlist", tags=["Watchlist"])

SYMBOL_PATTERN = re.compile(r"^[A-Z0-9]{2,10}$")

# Watchlist size per subscription tier. Kept high until payments are live.
TIER_LIMITS = {
    SubscriptionTier.FREE: 999,
    SubscriptionTier.STANDARD: 999,
    SubscriptionTier.PREMIUM: 999,
}


def _clean_symbol(symbol: str) -> str:
    sym = symbol.strip().upper()
    if not SYMBOL_PATTERN.match(sym):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Geçersiz hisse sembolü")
    return sym


@router.get("/")
async def get_watchlist(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Watchlist).where(Watchlist.user_id == current_user.id).order_by(Watchlist.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{symbol}")
async def add_to_watchlist(
    symbol: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Idempotent: adding a symbol that is already in the list is a no-op."""
    symbol = _clean_symbol(symbol)

    count = await db.scalar(
        select(func.count()).select_from(Watchlist).where(Watchlist.user_id == current_user.id)
    )
    limit = TIER_LIMITS.get(current_user.tier, 3)
    if (count or 0) >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Paket limitinize ulaştınız ({limit} hisse). Daha fazla hisse eklemek için paketinizi yükseltin.",
        )

    # ON CONFLICT DO NOTHING makes rapid double clicks safe at the database level
    await db.execute(
        insert(Watchlist)
        .values(user_id=current_user.id, symbol=symbol)
        .on_conflict_do_nothing(index_elements=["user_id", "symbol"])
    )
    await db.commit()
    return {"message": f"{symbol} takip listesine eklendi", "symbol": symbol}


@router.delete("/{symbol}")
async def remove_from_watchlist(
    symbol: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    symbol = _clean_symbol(symbol)
    await db.execute(delete(Watchlist).where(Watchlist.user_id == current_user.id, Watchlist.symbol == symbol))
    await db.commit()
    return {"message": f"{symbol} takip listesinden çıkarıldı", "symbol": symbol}
