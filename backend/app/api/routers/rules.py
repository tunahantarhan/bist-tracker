import asyncio
import time
import math
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import pandas as pd
from pydantic import BaseModel
from typing import Dict, Any, Optional

from app.core.database import get_db
from app.models.rule import Rule
from app.schemas.rule import RuleCreate, RuleUpdate, RuleResponse
from app.providers.yfinance_provider import YFinanceProvider
from app.services.rule_engine import RuleEngine
from app.services.cache_service import CacheService
from app.api.routers.market import TICKER_INFO
from app.models.universe import UniverseStock

router = APIRouter(tags=["Rules & Market"])
provider = YFinanceProvider()

OVERLAY_INDICATORS = {
    "SMA", "MA", "EMA",
    "BOLLINGER_UPPER", "BOLLINGER_MIDDLE", "BOLLINGER_LOWER",
    "BB_UPPER", "BB_MIDDLE", "BB_LOWER"
}

LINE_COLORS = [
    "#3b82f6", # Blue (MA 9)
    "#f59e0b", # Amber (MA 14)
    "#a855f7", # Purple (MA 21)
    "#06b6d4", # Cyan (MA 50)
    "#ec4899", # Pink (MA 100)
    "#84cc16", # Lime (MA 200)
    "#14b8a6", # Teal (Bollinger Middle)
    "#f43f5e", # Rose (Bollinger Lower/Upper)
]

OVERVIEW_CACHE_KEY = "bist_market_overview_v1"

# Concurrency locks and single-flight guards
_overview_lock = asyncio.Lock()
_overview_cache = {
    "timestamp": 0.0,
    "data": None,
}


def sanitize_for_json(obj: Any) -> Any:
    """Recursively replaces NaN and Infinity with None to guarantee strict JSON compliance."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    elif pd.isna(obj):
        return None
    return obj


async def invalidate_overview_cache():
    """Invalidates both local memory and Redis cache when rules or universe change."""
    _overview_cache["timestamp"] = 0.0
    _overview_cache["data"] = None
    await CacheService.delete_key(OVERVIEW_CACHE_KEY)


class RulePutUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    timeframe: Optional[str] = None
    is_primary_filter: Optional[bool] = None
    indicator_1: Optional[str] = None
    indicator_1_params: Optional[Dict[str, Any]] = None
    condition: Optional[str] = None
    target_type: Optional[str] = None
    static_value: Optional[float] = None
    indicator_2: Optional[str] = None
    indicator_2_params: Optional[Dict[str, Any]] = None
    score_impact: Optional[float] = None
    is_active: Optional[bool] = None


@router.get("/rules", response_model=list[RuleResponse])
async def get_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Rule).order_by(Rule.is_primary_filter.desc(), Rule.id.desc())
    )
    return result.scalars().all()


@router.post("/rules", response_model=RuleResponse)
async def create_rule(rule_in: RuleCreate, db: AsyncSession = Depends(get_db)):
    rule = Rule(**rule_in.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    await invalidate_overview_cache()
    return rule


@router.patch("/rules/{rule_id}", response_model=RuleResponse)
async def patch_rule(rule_id: int, rule_in: RuleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Rule).where(Rule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    update_data = rule_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    await invalidate_overview_cache()
    return rule


@router.put("/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(rule_id: int, rule_update: RulePutUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Rule).where(Rule.id == rule_id))
    db_rule = result.scalar_one_or_none()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Kural bulunamadı")

    update_data = rule_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_rule, key, value)

    await db.commit()
    await db.refresh(db_rule)
    await invalidate_overview_cache()
    return db_rule


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Rule).where(Rule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    if rule.is_primary_filter:
        raise HTTPException(
            status_code=400,
            detail="Ana RSI Filtresi sistemin çekirdeğidir ve silinemez. Yalnızca pasife alabilir veya parametrelerini düzenleyebilirsiniz."
        )

    await db.delete(rule)
    await db.commit()
    await invalidate_overview_cache()
    return {"detail": "Rule deleted successfully"}


@router.post("/rules/seed-defaults", response_model=list[RuleResponse])
async def seed_consultant_default_rules(db: AsyncSession = Depends(get_db)):
    default_suite = [
        {
            "name": "4S RSI (14) Düşen Trend Kırılımı (Mavi Çizgi)",
            "description": "4 Saatlik grafikte RSI(14) düşen direnç çizgisini yukarı kırmalı veya üzerinde olmalı",
            "timeframe": "4h",
            "is_primary_filter": True,
            "indicator_1": "RSI",
            "indicator_1_params": {"length": 14},
            "condition": ">",
            "target_type": "indicator",
            "indicator_2": "RSI_TRENDLINE",
            "indicator_2_params": {"length": 14, "lookback": 60, "min_peak": 55.0, "max_trend_end": 30.0},
            "score_impact": 25.0,
            "is_active": True,
        },
        {
            "name": "Stoch RSI (14,14,3,3) Pozitif Kesişim (%K > %D)",
            "description": "Stoch RSI %K çizgisi %D sinyal çizgisinin üzerinde",
            "timeframe": "4h",
            "is_primary_filter": False,
            "indicator_1": "STOCH_RSI_K",
            "indicator_1_params": {"length": 14, "rsi_length": 14, "k": 3, "d": 3},
            "condition": ">",
            "target_type": "indicator",
            "indicator_2": "STOCH_RSI_D",
            "indicator_2_params": {"length": 14, "rsi_length": 14, "k": 3, "d": 3},
            "score_impact": 10.0,
            "is_active": True,
        },
        {
            "name": "MACD (12,26,9) Pozitif Momentum (Line > Signal)",
            "description": "MACD ana çizgisi sinyal çizgisinin üzerinde",
            "timeframe": "4h",
            "is_primary_filter": False,
            "indicator_1": "MACD_LINE",
            "indicator_1_params": {"fast": 12, "slow": 26, "signal": 9},
            "condition": ">",
            "target_type": "indicator",
            "indicator_2": "MACD_SIGNAL",
            "indicator_2_params": {"fast": 12, "slow": 26, "signal": 9},
            "score_impact": 10.0,
            "is_active": True,
        },
        {
            "name": "Kısa Vade Ortalama: MA (9) > MA (14)",
            "description": "15 Dakikalık grafikte 9 periyotluk ortalama 14 periyotluk ortalamanın üzerinde",
            "timeframe": "15m",
            "is_primary_filter": False,
            "indicator_1": "SMA",
            "indicator_1_params": {"length": 9},
            "condition": ">",
            "target_type": "indicator",
            "indicator_2": "SMA",
            "indicator_2_params": {"length": 14},
            "score_impact": 10.0,
            "is_active": True,
        },
        {
            "name": "Orta Vade Ortalama: MA (21) > MA (50)",
            "description": "4 Saatlik grafikte MA(21) orta vadeli MA(50) ortalamasının üzerinde",
            "timeframe": "4h",
            "is_primary_filter": False,
            "indicator_1": "SMA",
            "indicator_1_params": {"length": 21},
            "condition": ">",
            "target_type": "indicator",
            "indicator_2": "SMA",
            "indicator_2_params": {"length": 50},
            "score_impact": 12.5,
            "is_active": True,
        },
        {
            "name": "Uzun Vade Ana Trend: MA (100) > MA (200)",
            "description": "Günlük grafikte MA(100) ana trend göstergesi MA(200) üzerinde",
            "timeframe": "1d",
            "is_primary_filter": False,
            "indicator_1": "SMA",
            "indicator_1_params": {"length": 100},
            "condition": ">",
            "target_type": "indicator",
            "indicator_2": "SMA",
            "indicator_2_params": {"length": 200},
            "score_impact": 12.5,
            "is_active": True,
        },
        {
            "name": "Bollinger Bandı (22, 2) Orta Bant Üzeri Güç",
            "description": "Fiyat 22 periyotluk ve 2 standart sapmalı Bollinger orta bandının üzerinde",
            "timeframe": "4h",
            "is_primary_filter": False,
            "indicator_1": "PRICE",
            "indicator_1_params": {},
            "condition": ">",
            "target_type": "indicator",
            "indicator_2": "BOLLINGER_MIDDLE",
            "indicator_2_params": {"length": 22, "std_dev": 2.0},
            "score_impact": 10.0,
            "is_active": True,
        },
        {
            "name": "Bollinger Bandı (22, 2) Alt Bant Desteği Üzeri",
            "description": "Fiyat Bollinger (22, 2) alt bandının üzerinde güvenli bölgede",
            "timeframe": "4h",
            "is_primary_filter": False,
            "indicator_1": "PRICE",
            "indicator_1_params": {},
            "condition": ">",
            "target_type": "indicator",
            "indicator_2": "BOLLINGER_LOWER",
            "indicator_2_params": {"length": 22, "std_dev": 2.0},
            "score_impact": 10.0,
            "is_active": True,
        },
    ]

    created_rules = []
    for item in default_suite:
        rule = Rule(**item)
        db.add(rule)
        created_rules.append(rule)

    await db.commit()
    for r in created_rules:
        await db.refresh(r)

    await invalidate_overview_cache()
    return created_rules


@router.get("/market/overview")
async def get_market_overview(db: AsyncSession = Depends(get_db)):
    """
    Scans the entire active BIST universe with Redis caching and single-flight lock protection.
    """
    # 1. Fast Redis Cache Check (< 2ms)
    cached_payload = await CacheService.get_json(OVERVIEW_CACHE_KEY)
    if cached_payload:
        return cached_payload

    # 2. Local memory fallback check (< 1ms)
    now = time.time()
    if _overview_cache["data"] is not None and (now - _overview_cache["timestamp"]) < 45.0:
        return _overview_cache["data"]

    # 3. Single-flight lock: Only one task computes overview, all others wait and consume the result
    async with _overview_lock:
        # Check again inside lock in case another worker just finished it
        cached_again = await CacheService.get_json(OVERVIEW_CACHE_KEY)
        if cached_again:
            return cached_again

        if _overview_cache["data"] is not None and (time.time() - _overview_cache["timestamp"]) < 45.0:
            return _overview_cache["data"]

        active_rules_res = await db.execute(
            select(Rule).where(Rule.is_active == True).order_by(Rule.is_primary_filter.desc(), Rule.id.asc())
        )
        active_rules = list(active_rules_res.scalars().all())
        required_tfs = {getattr(r, "timeframe", "1d") or "1d" for r in active_rules}
        if not required_tfs:
            required_tfs = {"4h"}
        required_tfs.add("1d")

        active_stocks_res = await db.execute(select(UniverseStock).where(UniverseStock.is_active == True))
        symbols = [s.symbol for s in active_stocks_res.scalars().all()]
        if not symbols:
            symbols = ["THYAO", "AKBNK", "KCHOL", "TUPRS", "GARAN"]

        # Limit concurrent network requests to Yahoo Finance (Max 6 parallel requests)
        semaphore = asyncio.Semaphore(6)

        async def _evaluate_single_symbol(sym: str):
            async with semaphore:
                try:
                    dfs_by_tf = {}
                    for tf in required_tfs:
                        df = await provider.fetch_historical_data(symbol=sym, interval=tf)
                        if df is not None and not df.empty:
                            dfs_by_tf[tf] = df.dropna(subset=["Close"])

                    default_df = dfs_by_tf.get("4h")
                    if default_df is None or default_df.empty:
                        default_df = next(iter(dfs_by_tf.values()), pd.DataFrame())

                    if default_df.empty or len(default_df) < 2:
                        return None

                    # Extract price directly from candles without firing extra HTTP calls
                    daily_df = dfs_by_tf.get("1d", default_df)
                    closes = daily_df["Close"].astype(float).tolist()
                    last_close = round(closes[-1], 2)
                    prev_close = round(closes[-2], 2) if len(closes) > 1 else last_close
                    change_pct = round(((last_close - prev_close) / prev_close) * 100, 2) if prev_close > 0 else 0.0

                    eval_res = {
                        "total_score": 0.0,
                        "primary_filter_passed": False,
                        "has_primary_filter": False,
                    }
                    if active_rules:
                        eval_res = RuleEngine.evaluate_symbol(default_df, active_rules, dataframes_by_tf=dfs_by_tf)

                    return {
                        "symbol": sym,
                        "name": TICKER_INFO.get(sym, sym),
                        "current_price": last_close,
                        "change_pct": change_pct,
                        "score": eval_res["total_score"],
                        "primary_filter_passed": eval_res["primary_filter_passed"],
                        "has_primary_filter": eval_res["has_primary_filter"],
                    }
                except Exception as e:
                    print(f"Overview scan skipped for {sym}: {e}")
                    return None

        results = await asyncio.gather(*[_evaluate_single_symbol(s) for s in symbols])
        valid_items = [r for r in results if r is not None]

        rsi_passed = sorted(
            [item for item in valid_items if item["primary_filter_passed"]],
            key=lambda x: x["score"],
            reverse=True,
        )
        top_scored = sorted(valid_items, key=lambda x: (x["score"], x["change_pct"]), reverse=True)[:10]
        top_priced = sorted(valid_items, key=lambda x: x["current_price"], reverse=True)[:10]

        payload = {
            "items": valid_items,
            "rsi_passed": rsi_passed,
            "top_scored": top_scored,
            "top_priced": top_priced,
        }

        sanitized_payload = sanitize_for_json(payload)

        _overview_cache["timestamp"] = time.time()
        _overview_cache["data"] = sanitized_payload
        await CacheService.set_json(OVERVIEW_CACHE_KEY, sanitized_payload, expiration=CacheService.OVERVIEW_EXPIRATION)

        return sanitized_payload


@router.get("/market/{symbol}")
async def get_market_data(
    symbol: str,
    period: str | None = None,
    interval: str = "4h",
    db: AsyncSession = Depends(get_db),
):
    clean_sym = symbol.upper()
    cache_key = f"bist_market_stock_{clean_sym}_{interval}_{period or 'default'}"

    # 1. Fast Redis Cache Hit (< 2ms)
    cached_stock = await CacheService.get_json(cache_key)
    if cached_stock:
        return cached_stock

    try:
        chart_task = asyncio.create_task(
            provider.fetch_historical_data(symbol=clean_sym, period=period, interval=interval)
        )
        rules_task = asyncio.create_task(
            db.execute(select(Rule).where(Rule.is_active == True).order_by(Rule.is_primary_filter.desc(), Rule.id.asc()))
        )

        chart_df, active_rules_res = await asyncio.gather(chart_task, rules_task)

        if chart_df.empty:
            raise HTTPException(status_code=404, detail="Hisse verisi bulunamadı")

        chart_df = chart_df.dropna(subset=["Open", "High", "Low", "Close"])
        if chart_df.empty:
            raise HTTPException(status_code=404, detail="Geçerli mum verisi bulunamadı")

        active_rules = list(active_rules_res.scalars().all())

        df_reset = chart_df.reset_index()
        date_col = "Datetime" if "Datetime" in df_reset.columns else "Date"
        time_strings = df_reset[date_col].astype(str).tolist()

        closes = df_reset["Close"].astype(float).round(2).tolist()
        opens = df_reset["Open"].astype(float).round(2).tolist()
        highs = df_reset["High"].astype(float).round(2).tolist()
        lows = df_reset["Low"].astype(float).round(2).tolist()

        last_close = closes[-1] if closes else 0.0
        prev_close = closes[-2] if len(closes) > 1 else last_close
        change_pct = round(((last_close - prev_close) / prev_close) * 100, 2) if prev_close > 0 else 0.0

        candles = [
            {"time": t, "open": o, "high": h, "low": l, "close": c}
            for t, o, h, l, c in zip(time_strings, opens, highs, lows, closes)
        ]

        required_tfs = {getattr(r, "timeframe", "1d") or "1d" for r in active_rules}
        required_tfs.add("1d")
        
        dataframes_by_tf = {interval: chart_df}
        missing_tfs = [tf for tf in required_tfs if tf not in dataframes_by_tf]

        if missing_tfs:
            fetched_dfs = await asyncio.gather(
                *[provider.fetch_historical_data(symbol=clean_sym, interval=tf) for tf in missing_tfs],
                return_exceptions=True,
            )
            for tf, res_df in zip(missing_tfs, fetched_dfs):
                if isinstance(res_df, pd.DataFrame) and not res_df.empty:
                    dataframes_by_tf[tf] = res_df.dropna(subset=["Close"])

        daily_df = dataframes_by_tf.get("1d")
        if daily_df is not None and not daily_df.empty:
            daily_closes = daily_df["Close"].astype(float).round(2).dropna().tolist()
            if daily_closes:
                last_close = daily_closes[-1]
                prev_close = daily_closes[-2] if len(daily_closes) > 1 else last_close
                if prev_close > 0:
                    change_pct = round(((last_close - prev_close) / prev_close) * 100, 2)

        evaluation = {
            "total_score": 0.0,
            "primary_filter_passed": True,
            "has_primary_filter": False,
            "rules_breakdown": [],
        }
        indicator_overlays = []

        if active_rules:
            evaluation = RuleEngine.evaluate_symbol(chart_df, active_rules, dataframes_by_tf=dataframes_by_tf)

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
                        series = RuleEngine.get_indicator_series(chart_df, ind_name, params_dict)
                        if series is not None:
                            vals = series.tolist()
                            line_data = [
                                {"time": t, "value": round(float(v), 2)}
                                for t, v in zip(time_strings, vals)
                                if pd.notna(v) and not math.isinf(v)
                            ]
                            label = f"{ind_name.upper()} ({length_val})" if length_val else ind_name.upper()
                            indicator_overlays.append({
                                "name": label,
                                "color": LINE_COLORS[color_idx % len(LINE_COLORS)],
                                "data": line_data
                            })
                            color_idx += 1
                    except Exception as ind_err:
                        print(f"Overlay calculation skipped for {key}: {ind_err}")

        # Extract RSI parameters directly from the active primary rule in database
        primary_rule = next((r for r in active_rules if getattr(r, "is_primary_filter", False)), None)
        trend_params = {"length": 14, "lookback": 60, "min_peak": 55.0, "max_trend_end": 30.0}
        if primary_rule and primary_rule.indicator_2_params:
            trend_params.update(primary_rule.indicator_2_params)

        rsi_pane = {"rsi": [], "trendline": [], "slope": None, "peak_rsi": None}
        try:
            rsi_length = int(trend_params.get("length", 14))
            rsi_series = RuleEngine.get_indicator_series(chart_df, "RSI", {"length": rsi_length})
            trend_series, trend_meta = RuleEngine.calculate_rsi_downtrend_series(
                df_reset["Close"].astype(float), trend_params
            )
            r_vals = rsi_series.tolist() if rsi_series is not None else []
            tr_vals = trend_series.tolist() if trend_series is not None else []

            rsi_pane["rsi"] = [
                {"time": t, "value": round(float(v), 2)}
                for t, v in zip(time_strings, r_vals)
                if pd.notna(v) and not math.isinf(v)
            ]
            rsi_pane["trendline"] = [
                {"time": t, "value": round(float(v), 2)}
                for t, v in zip(time_strings, tr_vals)
                if pd.notna(v) and not math.isinf(v)
            ]
            rsi_pane["slope"] = trend_meta.get("slope")
            rsi_pane["peak_rsi"] = trend_meta.get("peak_rsi")
        except Exception as rsi_err:
            print(f"RSI sub-pane calculation skipped: {rsi_err}")

        response_data = {
            "symbol": clean_sym,
            "interval": interval,
            "current_price": round(last_close, 2) if pd.notna(last_close) else 0.0,
            "change_pct": change_pct if pd.notna(change_pct) else 0.0,
            "candles": candles,
            "score": evaluation["total_score"],
            "primary_filter_passed": evaluation["primary_filter_passed"],
            "has_primary_filter": evaluation["has_primary_filter"],
            "rules_breakdown": evaluation["rules_breakdown"],
            "indicators": indicator_overlays,
            "rsi_pane": rsi_pane,
        }

        safe_response = sanitize_for_json(response_data)
        await CacheService.set_json(cache_key, safe_response, expiration=CacheService.MARKET_EXPIRATION)
        return safe_response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/universe/active")
async def get_active_universe(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UniverseStock).where(UniverseStock.is_active == True))
    stocks = result.scalars().all()
    if not stocks:
        default_symbols = ["THYAO", "AKBNK", "KCHOL", "TUPRS", "GARAN"]
        for sym in default_symbols:
            db.add(UniverseStock(symbol=sym, is_active=True))
        await db.commit()
        return default_symbols
    return [s.symbol for s in stocks]


@router.post("/market/universe/update")
async def update_universe(symbols: list[str], db: AsyncSession = Depends(get_db)):
    await db.execute(select(UniverseStock).where(UniverseStock.is_active == True))
    all_stocks_res = await db.execute(select(UniverseStock))
    for stock in all_stocks_res.scalars().all():
        stock.is_active = False
    
    for sym in symbols:
        result = await db.execute(select(UniverseStock).where(UniverseStock.symbol == sym))
        stock = result.scalar_one_or_none()
        if stock:
            stock.is_active = True
        else:
            db.add(UniverseStock(symbol=sym, is_active=True))
            
    await db.commit()
    await invalidate_overview_cache()
    return {"status": "success", "active_count": len(symbols)}