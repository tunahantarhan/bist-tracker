from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.rule import Rule
from app.schemas.rule import RuleCreate, RuleResponse
from app.providers.yfinance_provider import YFinanceProvider

router = APIRouter(tags=["Rules & Market"])
provider = YFinanceProvider()

@router.get("/rules", response_model=list[RuleResponse])
async def get_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Rule).order_by(Rule.id.desc()))
    return result.scalars().all()

@router.post("/rules", response_model=RuleResponse)
async def create_rule(rule_in: RuleCreate, db: AsyncSession = Depends(get_db)):
    rule = Rule(**rule_in.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule

@router.get("/market/{symbol}")
async def get_market_data(symbol: str):
    try:
        df = await provider.fetch_data(symbol=symbol, period="5d", interval="15m")
        if df.empty:
            raise HTTPException(status_code=404, detail="Hisse verisi bulunamadı")
        
        last_close = float(df["Close"].iloc[-1])
        prev_close = float(df["Close"].iloc[-2]) if len(df) > 1 else last_close
        change_pct = round(((last_close - prev_close) / prev_close) * 100, 2)

        candles = []
        for index, row in df.iterrows():
            candles.append({
                "time": int(index.timestamp()),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
            })

        return {
            "symbol": symbol.upper(),
            "current_price": round(last_close, 2),
            "change_pct": change_pct,
            "candles": candles
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))