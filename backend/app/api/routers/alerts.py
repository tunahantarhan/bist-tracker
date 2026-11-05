from datetime import datetime
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, delete, select

from app.core.database import get_db
from app.core.market_hours import now_tr_naive
from app.models.alert import UserCustomAlert
from app.models.rule import Rule
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/alerts", tags=["User Custom Alerts"])


class AlertCreate(BaseModel):
    symbol: str = Field(min_length=2, max_length=10, pattern=r"^[A-Za-z0-9]+$")
    rule_id: Optional[int] = None
    timeframe: Optional[Literal["5m", "15m", "1h", "4h", "1d"]] = "15m"


class AlertResponse(BaseModel):
    id: int
    symbol: str
    rule_id: Optional[int] = None
    timeframe: str
    is_active: bool
    created_at: datetime
    last_triggered_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[AlertResponse])
async def get_my_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all configured custom alerts for the current authenticated user."""
    res = await db.execute(
        select(UserCustomAlert)
        .where(UserCustomAlert.user_id == current_user.id)
        .order_by(UserCustomAlert.created_at.desc())
    )
    return res.scalars().all()


@router.post("", response_model=AlertResponse)
async def create_custom_alert(
    alert_in: AlertCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    clean_sym = alert_in.symbol.strip().upper()
    
    if alert_in.rule_id is not None and not await db.get(Rule, alert_in.rule_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kural bulunamadı")

    # One alert per (symbol, rule); different rules on the same timeframe are allowed
    rule_filter = (
        UserCustomAlert.rule_id.is_(None) if alert_in.rule_id is None else UserCustomAlert.rule_id == alert_in.rule_id
    )
    existing = await db.execute(
        select(UserCustomAlert.id).where(
            and_(UserCustomAlert.user_id == current_user.id, UserCustomAlert.symbol == clean_sym, rule_filter)
        )
    )
    if existing.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{clean_sym} için bu kurala zaten bir alarmınız var.",
        )

    new_alert = UserCustomAlert(
        user_id=current_user.id,
        symbol=clean_sym,
        rule_id=alert_in.rule_id,
        timeframe=alert_in.timeframe or "15m",
        is_active=True,
        created_at=now_tr_naive(),
    )
    db.add(new_alert)
    await db.commit()
    await db.refresh(new_alert)
    return new_alert


@router.delete("/symbol/{symbol}")
async def delete_alert_by_symbol(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Removes every alert the user has for the symbol."""
    clean_sym = symbol.strip().upper()
    res = await db.execute(
        delete(UserCustomAlert).where(
            and_(UserCustomAlert.user_id == current_user.id, UserCustomAlert.symbol == clean_sym)
        )
    )
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alarm bulunamadı")
    await db.commit()
    return {"status": "success", "message": f"{clean_sym} alarmları silindi"}


@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Deletes custom alert by its primary key ID."""
    res = await db.execute(
        select(UserCustomAlert).where(
            and_(
                UserCustomAlert.id == alert_id,
                UserCustomAlert.user_id == current_user.id
            )
        )
    )
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alarm bulunamadı")

    await db.delete(alert)
    await db.commit()
    return {"status": "success"}