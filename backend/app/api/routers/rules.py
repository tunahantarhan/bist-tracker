from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import pandas as pd

from app.core.database import get_db
from app.models.rule import Rule
from app.schemas.rule import RuleCreate, RuleUpdate, RuleResponse
from app.providers.yfinance_provider import YFinanceProvider
from app.services.rule_engine import RuleEngine

router = APIRouter(tags=["Rules & Market"])
provider = YFinanceProvider()

@router.get("/rules", response_model=list[RuleResponse])
async def get_rules(db: AsyncSession = Depends(get_db)):
    """Fetches all configured algorithmic rules ordered by newest first."""
    result = await db.execute(select(Rule).order_by(Rule.id.desc()))
    return result.scalars().all()

@router.post("/rules", response_model=RuleResponse)
async def create_rule(rule_in: RuleCreate, db: AsyncSession = Depends(get_db)):
    """Creates a new global technical analysis rule."""
    rule = Rule(**rule_in.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule

@router.patch("/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(rule_id: int, rule_in: RuleUpdate, db: AsyncSession = Depends(get_db)):
    """Updates an existing rule (e.g., toggling is_active or changing score_impact)."""
    result = await db.execute(select(Rule).where(Rule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    update_data = rule_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return rule

@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Deletes a rule by ID."""
    result = await db.execute(select(Rule).where(Rule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.delete(rule)
    await db.commit()
    return {"detail": "Rule deleted successfully"}

@router.get("/market/{symbol}")
async def get_market_data(symbol: str, db: AsyncSession = Depends(get_db)):
    """
    Fetches 15m chart candles and evaluates active global rules on 1d historical data.
    """
    try:
        # 1. Fetch 15-minute data for intraday chart display
        data = await provider.fetch_stock_data(symbol=symbol, period="1mo", interval="15m")
        if not data:
            raise HTTPException(status_code=404, detail="Stock data not found")

        last_close = float(data[-1]["Close"])
        prev_close = float(data[-2]["Close"]) if len(data) > 1 else last_close
        change_pct = round(((last_close - prev_close) / prev_close) * 100, 2)

        candles = [
            {
                "time": row["Date"],
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
            }
            for row in data
        ]

        # 2. Fetch 1-year daily data to properly calculate SMA 200, Bollinger (22), etc.
        daily_df = await provider.fetch_historical_data(symbol=symbol, period="1y", interval="1d")
        
        # 3. Fetch active rules and evaluate score
        active_rules_res = await db.execute(select(Rule).where(Rule.is_active == True))
        active_rules = active_rules_res.scalars().all()

        evaluation = {"total_score": 0.0, "rules_breakdown": []}
        if not daily_df.empty and active_rules:
            evaluation = RuleEngine.evaluate_symbol(daily_df, list(active_rules))

        return {
            "symbol": symbol.upper(),
            "current_price": round(last_close, 2),
            "change_pct": change_pct,
            "candles": candles,
            "score": evaluation["total_score"],
            "rules_breakdown": evaluation["rules_breakdown"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))