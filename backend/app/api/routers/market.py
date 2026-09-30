from fastapi import APIRouter
from datetime import datetime
import asyncio
from app.providers.yfinance_provider import YFinanceProvider

router = APIRouter(prefix="/market", tags=["Market"])
provider = YFinanceProvider()

# TODO: Will also be selected from admin panel in the future. For now, it is hardcoded.
TICKER_INFO = {
    "THYAO": "Türk Hava Yolları A.O.",
    "KCHOL": "Koç Holding A.Ş.",
    "GARAN": "Garanti BBVA",
    "ASELS": "Aselsan Elektronik",
    "BIMAS": "BİM Birleşik Mağazalar",
    "TUPRS": "Tüpraş",
    "ISCTR": "Türkiye İş Bankası",
    "AKBNK": "Akbank T.A.Ş.",
    "SAHOL": "Sabancı Holding",
    "EREGL": "Erdemir Ereğli Demir Çelik"
}

_ticker_cache = {
    "data": [],
    "last_updated": None
}
CACHE_TTL_SECONDS = 15 # Data is being cached for 15 seconds

@router.get("/ticker")
async def get_ticker_data():
    now = datetime.now()
    
    if _ticker_cache["last_updated"] and (now - _ticker_cache["last_updated"]).total_seconds() < CACHE_TTL_SECONDS:
        return _ticker_cache["data"]
        
    tasks = [provider.fetch_current_price(symbol) for symbol in TICKER_INFO.keys()]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    valid_results = [
        res for res in results 
        if not isinstance(res, Exception) and res.get("current_price", 0) > 0
    ]
    
    if valid_results:
        _ticker_cache["data"] = valid_results
        _ticker_cache["last_updated"] = now
    
    return _ticker_cache["data"]

@router.get("/universe")
async def get_universe():
    # Real stock symbol and company name are sent to the frontend search bar
    return [{"symbol": k, "name": v} for k, v in TICKER_INFO.items()]