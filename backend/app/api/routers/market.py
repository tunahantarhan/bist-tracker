import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.core.stock_catalog import STOCK_CATALOG
from app.models.universe import UniverseStock
from app.providers.quotes import quote_book
from app.services.market_service import (
    FALLBACK_UNIVERSE,
    get_overview,
    get_symbol_detail,
    invalidate_market_caches,
    public_overview,
)

router = APIRouter(prefix="/market", tags=["Market"])

SYMBOL_PATTERN = re.compile(r"^[A-Z0-9]{2,10}$")
Interval = Query("1h", pattern="^(5m|15m|1h|4h|1d)$")
Period = Query(None, pattern="^(5d|1mo|3mo|6mo|1y|2y|5y)$")


def _clean_symbol(symbol: str) -> str:
    sym = symbol.strip().upper()
    if not SYMBOL_PATTERN.match(sym):
        raise HTTPException(status_code=400, detail="Geçersiz hisse sembolü")
    return sym


TICKER_SIZE = 100  # most liquid stocks; the band is a marquee, not a full list
TROY_OUNCE_GRAM = 31.1034768
MACRO_SYMBOLS = {"xu100": "XU100.IS", "usd": "USDTRY=X", "eur": "EURTRY=X", "gold": "GC=F"}


@router.get("/ticker")
async def get_ticker_data():
    """Ticker band from the shared quote snapshot (same prices as overview and detail)."""
    quotes = await quote_book.get_quotes(STOCK_CATALOG.keys())
    ranked = sorted(
        quotes.items(),
        key=lambda kv: (kv[1].avg_volume_3m or kv[1].volume or 0) * kv[1].price,
        reverse=True,
    )[:TICKER_SIZE]
    ranked.sort(key=lambda kv: kv[0])
    return [
        {"symbol": sym, "current_price": round(q.price, 2), "change_pct": q.change_pct}
        for sym, q in ranked
    ]


@router.get("/macro")
async def get_macro_market_data():
    """BIST 100, gram gold (derived: COMEX gold futures / troy ounce x USDTRY), USD/TRY and EUR/TRY."""
    quotes = await quote_book.get_quotes(MACRO_SYMBOLS.values())
    xu100, usd, eur, gold = (quotes.get(MACRO_SYMBOLS[k]) for k in ("xu100", "usd", "eur", "gold"))

    def _item(symbol: str, label: str, price: float | None, change: float, prefix: str, as_of: int | None):
        return {
            "symbol": symbol, "label": label, "current_price": round(price or 0.0, 2),
            "change_pct": change, "prefix": prefix, "suffix": "", "as_of": as_of,
        }

    items = []
    if xu100:
        items.append(_item("BIST 100", "BIST 100", xu100.price, xu100.change_pct, "", xu100.time))
    if gold and usd:
        gram = gold.price / TROY_OUNCE_GRAM * usd.price
        gram_prev = (gold.prev_close or gold.price) / TROY_OUNCE_GRAM * (usd.prev_close or usd.price)
        items.append(_item("GRAM_ALTIN", "Gram Altın", gram, round((gram - gram_prev) / gram_prev * 100, 2), "₺",
                           max(gold.time, usd.time)))
    if usd:
        items.append(_item("USD/TRY", "Dolar", usd.price, usd.change_pct, "₺", usd.time))
    if eur:
        items.append(_item("EUR/TRY", "Euro", eur.price, eur.change_pct, "₺", eur.time))
    return items


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
    """Scored snapshot of the active universe (stale-while-revalidate; see market_service)."""
    return public_overview(await get_overview(db))


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
