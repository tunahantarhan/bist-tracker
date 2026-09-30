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

# Price-scale overlay indicators that can be drawn directly on the candlestick chart
OVERLAY_INDICATORS = {
    "SMA", "MA", "EMA",
    "BOLLINGER_UPPER", "BOLLINGER_MIDDLE", "BOLLINGER_LOWER",
    "BB_UPPER", "BB_MIDDLE", "BB_LOWER"
}

LINE_COLORS = [
    "#3b82f6", # Blue
    "#f59e0b", # Amber
    "#a855f7", # Purple
    "#06b6d4", # Cyan
    "#ec4899", # Pink
    "#84cc16", # Lime
]

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
    """Updates an existing rule."""
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
async def get_market_data(symbol: str, period: str = "1y", interval: str = "1d", db: AsyncSession = Depends(get_db)):
    """
    Fetches historical candles, evaluates active global rules, and generates indicator overlay lines.
    Default is 1y / 1d so that long-period indicators (like MA 200) can be accurately calculated and drawn.
    """
    try:
        daily_df = await provider.fetch_historical_data(symbol=symbol, period=period, interval=interval)
        if daily_df.empty:
            raise HTTPException(status_code=404, detail="Hisse verisi bulunamadı")

        df_reset = daily_df.reset_index()
        date_col = "Datetime" if "Datetime" in df_reset.columns else "Date"

        last_close = float(df_reset["Close"].iloc[-1])
        prev_close = float(df_reset["Close"].iloc[-2]) if len(df_reset) > 1 else last_close
        change_pct = round(((last_close - prev_close) / prev_close) * 100, 2)

        candles = []
        for _, row in df_reset.iterrows():
            candles.append({
                "time": str(row[date_col]),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
            })

        # Fetch active rules and evaluate score
        active_rules_res = await db.execute(select(Rule).where(Rule.is_active == True).order_by(Rule.id.asc()))
        active_rules = list(active_rules_res.scalars().all())

        evaluation = {"total_score": 0.0, "rules_breakdown": []}
        indicator_overlays = []

        if active_rules:
            evaluation = RuleEngine.evaluate_symbol(daily_df, active_rules)

            # Collect unique price-overlay indicators from active rules to draw on the chart
            seen_overlays = set()
            color_idx = 0

            for rule in active_rules:
                pairs = [(rule.indicator_1, rule.indicator_1_params)]
                if rule.target_type == "indicator" and rule.indicator_2:
                    pairs.append((rule.indicator_2, rule.indicator_2_params))

                for ind_name, ind_params in pairs:
                    if not ind_name or ind_name.upper() not in OVERLAY_INDICATORS:
                        continue
                    params_dict = ind_params or {}
                    length_val = params_dict.get("length", params_dict.get("period", ""))
                    key = f"{ind_name.upper()}_{length_val}"

                    if key in seen_overlays:
                        continue
                    seen_overlays.add(key)

                    try:
                        series = RuleEngine.get_indicator_series(daily_df, ind_name, params_dict)
                        if series is not None:
                            line_data = []
                            for idx_val, val in enumerate(series):
                                if pd.notna(val):
                                    line_data.append({
                                        "time": str(df_reset[date_col].iloc[idx_val]),
                                        "value": round(float(val), 2)
                                    })
                            label = f"{ind_name.upper()} ({length_val})" if length_val else ind_name.upper()
                            indicator_overlays.append({
                                "name": label,
                                "color": LINE_COLORS[color_idx % len(LINE_COLORS)],
                                "data": line_data
                            })
                            color_idx += 1
                    except Exception as ind_err:
                        print(f"Overlay calculation skipped for {key}: {ind_err}")

        return {
            "symbol": symbol.upper(),
            "current_price": round(last_close, 2),
            "change_pct": change_pct,
            "candles": candles,
            "score": evaluation["total_score"],
            "rules_breakdown": evaluation["rules_breakdown"],
            "indicators": indicator_overlays
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))