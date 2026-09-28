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
        # Datas are fetched every 15 minutes
        data = await provider.fetch_stock_data(symbol=symbol, period="5d", interval="15m")
        
        # Instead of DataFrame, we check standart Python list for empty data
        if not data:
            raise HTTPException(status_code=404, detail="Hisse verisi bulunamadı")
        
        # Since the data is in JSON format (dict), we access it by index
        last_close = float(data[-1]["Close"])
        prev_close = float(data[-2]["Close"]) if len(data) > 1 else last_close
        change_pct = round(((last_close - prev_close) / prev_close) * 100, 2)

        candles = []
        for row in data:
            candles.append({
                "time": row["Date"], # Data row where the timestamp is stored
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