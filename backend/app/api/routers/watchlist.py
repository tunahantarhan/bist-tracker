from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.database import get_db
from app.models.watchlist import Watchlist
from app.models.user import User, SubscriptionTier
from app.api.deps import get_current_user

router = APIRouter(prefix="/watchlist", tags=["Watchlist"])

# Stock watchlist limits based on subscription tiers. Currently set to high limits for testing purposes.
# TODO: Will be adjusted based on actual subscription tier limits in the future when the subscription system is fully implemented.
TIER_LIMITS = {
    SubscriptionTier.FREE: 999, 
    SubscriptionTier.STANDARD: 999,
    SubscriptionTier.PREMIUM: 999
}

@router.get("/")
async def get_watchlist(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Watchlist).where(Watchlist.user_id == current_user.id)
    )
    return result.scalars().all()

@router.post("/{symbol}")
async def add_to_watchlist(symbol: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    symbol = symbol.upper()
    
    # Current number of stocks in the user's watchlist
    result = await db.execute(select(Watchlist).where(Watchlist.user_id == current_user.id))
    current_watchlist = result.scalars().all()
    
    # Check if the stock is already in the user's watchlist
    if any(item.symbol == symbol for item in current_watchlist):
        raise HTTPException(status_code=400, detail="Bu hisse zaten takip listenizde.")
    
    # --- USER LIMIT CONTROL DISABLED (Unlimited Addition For Now) ---
    # Once the subscription system is fully implemented, this section will be re-enabled to enforce watchlist limits based on the user's subscription tier.
    """
    limit = TIER_LIMITS.get(current_user.tier, 3)
    if len(current_watchlist) >= limit:
        raise HTTPException(
            status_code=403, 
            detail=f"Paket limitinize ulaştınız ({limit} hisse). Daha fazla hisse eklemek için paketinizi yükseltin."
        )
    """
        
    new_item = Watchlist(user_id=current_user.id, symbol=symbol)
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    
    return {"message": f"{symbol} takip listesine eklendi", "item": new_item}

@router.delete("/{symbol}")
async def remove_from_watchlist(symbol: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    stmt = delete(Watchlist).where(
        Watchlist.user_id == current_user.id, 
        Watchlist.symbol == symbol.upper()
    )
    await db.execute(stmt)
    await db.commit()
    
    return {"message": f"{symbol} takip listesinden çıkarıldı"}