from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.database import get_db
from app.models.alert import UserCustomAlert
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/alerts", tags=["User Custom Alerts"])


class AlertCreate(BaseModel):
    symbol: str
    rule_id: Optional[int] = None
    timeframe: Optional[str] = "15m"


class AlertResponse(BaseModel):
    id: int
    symbol: str
    rule_id: Optional[int] = None
    timeframe: str
    is_active: bool
    created_at: datetime
    last_triggered_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("", response_model=List[AlertResponse])
async def get_my_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Kullanıcının kayıtlı tüm özel alarmlarını listeler."""
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
    
    existing = await db.execute(
        select(UserCustomAlert).where(
            and_(
                UserCustomAlert.user_id == current_user.id,
                UserCustomAlert.symbol == clean_sym,
                UserCustomAlert.timeframe == alert_in.timeframe
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{clean_sym} için {alert_in.timeframe} periyodunda zaten aktif bir alarmınız var."
        )

    new_alert = UserCustomAlert(
        user_id=current_user.id,
        symbol=clean_sym,
        rule_id=alert_in.rule_id,
        timeframe=alert_in.timeframe or "15m",
        is_active=True
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
    """Removes the alert according to the symbol name (for the toggle on the detail page)."""
    clean_sym = symbol.strip().upper()
    res = await db.execute(
        select(UserCustomAlert).where(
            and_(
                UserCustomAlert.user_id == current_user.id,
                UserCustomAlert.symbol == clean_sym
            )
        )
    )
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alarm bulunamadı")

    await db.delete(alert)
    await db.commit()
    return {"status": "success", "message": f"{clean_sym} alarmı silindi"}


@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Alert deletion with ID"""
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