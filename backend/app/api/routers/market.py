import asyncio
import re

import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.core.stock_catalog import STOCK_CATALOG
from app.models.universe import UniverseStock
from app.services.cache_service import CacheService
from app.services.market_service import (
    FALLBACK_UNIVERSE,
    get_overview,
    get_symbol_detail,
    invalidate_market_caches,
)

router = APIRouter(prefix="/market", tags=["Market"])

SYMBOL_PATTERN = re.compile(r"^[A-Z0-9]{2,10}$")
Interval = Query("4h", pattern="^(5m|15m|1h|4h|1d)$")
Period = Query(None, pattern="^(5d|1mo|3mo|6mo|1y|2y|5y)$")


def _clean_symbol(symbol: str) -> str:
    sym = symbol.strip().upper()
    if not SYMBOL_PATTERN.match(sym):
        raise HTTPException(status_code=400, detail="Geçersiz hisse sembolü")
    return sym


CACHE_KEY_TICKER = "bist_ticker_data_v1"
CACHE_KEY_MACRO = "macro_market_data_v2"
CACHE_TTL_SECONDS = 60

@router.get("/ticker")
async def get_ticker_data():
    cached = await CacheService.get_json(CACHE_KEY_TICKER)
    if cached:
        return cached

    # Cache miss: one bulk Yahoo Finance download for the whole catalog
    def _fetch_bulk():
        symbols = list(STOCK_CATALOG.keys())
        yf_syms_list = [f"{s}.IS" if not s.endswith(".IS") else s for s in symbols]
        yf_syms_str = " ".join(yf_syms_list)
        
        df = yf.download(yf_syms_str, period="5d", interval="1d", progress=False)
        res = []
        
        if isinstance(df.columns, pd.MultiIndex):
            close_df = df['Close']
        else:
            close_df = pd.DataFrame({yf_syms_list[0]: df['Close']})

        for s, yf_s in zip(symbols, yf_syms_list):
            try:
                if yf_s in close_df:
                    closes = close_df[yf_s].dropna().tolist()
                    if len(closes) >= 2:
                        curr = float(closes[-1])
                        prev = float(closes[-2])
                        change_pct = ((curr - prev) / prev) * 100
                        res.append({
                            "symbol": s,
                            "current_price": round(curr, 2),
                            "change_pct": round(change_pct, 2)
                        })
            except Exception:
                continue
        return res

    valid_results = await asyncio.to_thread(_fetch_bulk)
    
    if valid_results:
        await CacheService.set_json(CACHE_KEY_TICKER, valid_results, expiration=CACHE_TTL_SECONDS)
        return valid_results
    
    return []


@router.get("/macro")
async def get_macro_market_data():
    """
    Returns BIST 100, Gram Gold, USD/TRY, and EUR/TRY with Redis caching.
    """
    cached = await CacheService.get_json(CACHE_KEY_MACRO)
    if cached:
        return cached

    def _fetch_macro():
        macro_tickers = ["XU100.IS", "USDTRY=X", "EURTRY=X", "GC=F"]
        df = yf.download(" ".join(macro_tickers), period="5d", interval="1d", progress=False)
        
        if df.empty:
            return []

        close_df = df['Close'] if isinstance(df.columns, pd.MultiIndex) else df

        def _get_last_and_prev(col_name: str):
            if col_name in close_df:
                series = close_df[col_name].dropna().tolist()
                if len(series) >= 2:
                    return float(series[-1]), float(series[-2])
                elif len(series) == 1:
                    return float(series[-1]), float(series[-1])
            return 0.0, 0.0

        xu100_curr, xu100_prev = _get_last_and_prev("XU100.IS")
        usd_curr, usd_prev = _get_last_and_prev("USDTRY=X")
        eur_curr, eur_prev = _get_last_and_prev("EURTRY=X")
        ons_curr, ons_prev = _get_last_and_prev("GC=F")

        # Gram Gold (TRY) calculation: (Ons Gold / 31.1034768) * USDTRY
        TROY_OUNCE_GRAM = 31.1034768
        gram_curr = (ons_curr / TROY_OUNCE_GRAM) * usd_curr if ons_curr > 0 and usd_curr > 0 else 0.0
        gram_prev = (ons_prev / TROY_OUNCE_GRAM) * usd_prev if ons_prev > 0 and usd_prev > 0 else 0.0

        def _calc_pct(curr, prev):
            if prev > 0:
                return round(((curr - prev) / prev) * 100, 2)
            return 0.0

        # Order: BIST 100 -> Gram Altın -> Dolar -> Euro
        results = [
            {
                "symbol": "BIST 100",
                "label": "BIST 100",
                "current_price": round(xu100_curr, 2),
                "change_pct": _calc_pct(xu100_curr, xu100_prev),
                "prefix": "",
                "suffix": ""
            },
            {
                "symbol": "GRAM_ALTIN",
                "label": "Gram Altın",
                "current_price": round(gram_curr, 2),
                "change_pct": _calc_pct(gram_curr, gram_prev),
                "prefix": "₺",
                "suffix": ""
            },
            {
                "symbol": "USD/TRY",
                "label": "Dolar",
                "current_price": round(usd_curr, 2),
                "change_pct": _calc_pct(usd_curr, usd_prev),
                "prefix": "₺",
                "suffix": ""
            },
            {
                "symbol": "EUR/TRY",
                "label": "Euro",
                "current_price": round(eur_curr, 2),
                "change_pct": _calc_pct(eur_curr, eur_prev),
                "prefix": "₺",
                "suffix": ""
            }
        ]
        return results

    macro_data = await asyncio.to_thread(_fetch_macro)

    if macro_data:
        await CacheService.set_json(CACHE_KEY_MACRO, macro_data, expiration=CACHE_TTL_SECONDS)
        return macro_data

    return []


@router.get("/universe")
async def get_catalog():
    """Full stock catalog (symbol + company name) for search and admin selection."""
    return [{"symbol": k, "name": v} for k, v in STOCK_CATALOG.items()]


@router.get("/universe/active")
async def get_active_universe(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UniverseStock.symbol).where(UniverseStock.is_active.is_(True)))
    symbols = list(result.scalars().all())
    return symbols or FALLBACK_UNIVERSE


@router.post("/universe/update", dependencies=[Depends(get_current_admin)])
async def update_universe(symbols: list[str], db: AsyncSession = Depends(get_db)):
    clean = sorted({_clean_symbol(s) for s in symbols})
    unknown = [s for s in clean if s not in STOCK_CATALOG]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Katalogda olmayan semboller: {', '.join(unknown)}")

    await db.execute(update(UniverseStock).values(is_active=False))
    existing = set((await db.execute(select(UniverseStock.symbol))).scalars().all())
    if clean:
        await db.execute(
            update(UniverseStock).where(UniverseStock.symbol.in_(clean)).values(is_active=True)
        )
    for sym in clean:
        if sym not in existing:
            db.add(UniverseStock(symbol=sym, is_active=True))

    await db.commit()
    await invalidate_market_caches()
    return {"status": "success", "active_count": len(clean)}


@router.get("/overview")
async def get_market_overview(db: AsyncSession = Depends(get_db)):
    """Scored snapshot of the active universe (cached; refreshed by the background scanner)."""
    return await get_overview(db)


# Must stay last: catches /market/{symbol}
@router.get("/{symbol}")
async def get_market_data(
    symbol: str,
    interval: str = Interval,
    period: str | None = Period,
    db: AsyncSession = Depends(get_db),
):
    detail = await get_symbol_detail(db, _clean_symbol(symbol), interval=interval, period=period)
    if detail is None:
        raise HTTPException(status_code=404, detail="Hisse verisi bulunamadı")
    return detail
