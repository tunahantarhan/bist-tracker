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
    "ASELS": "Aselsan Elektronik Sanayi",
    "BIMAS": "BİM Birleşik Mağazalar A.Ş.",
    "TUPRS": "Tüpraş Türkiye Petrol Rafinerileri",
    "ISCTR": "Türkiye İş Bankası A.Ş.",
    "AKBNK": "Akbank T.A.Ş.",
    "SAHOL": "Hacı Ömer Sabancı Holding",
    "EREGL": "Ereğli Demir ve Çelik Fabrikaları",
    "SISE": "Türkiye Şişe ve Cam Fabrikaları",
    "FROTO": "Ford Otomotiv Sanayi A.Ş.",
    "YKBNK": "Yapı ve Kredi Bankası A.Ş.",
    "TOASO": "Tofaş Türk Otomobil Fabrikası",
    "ENKAI": "Enka İnşaat ve Sanayi A.Ş.",
    "PETKM": "Petkim Petrokimya Holding A.Ş.",
    "PGSUS": "Pegasus Hava Taşımacılığı A.Ş.",
    "TCELL": "Turkcell İletişim Hizmetleri",
    "TTKOM": "Türk Telekomünikasyon A.Ş.",
    "VAKBN": "Türkiye Vakıflar Bankası T.A.O.",
    "HALKB": "Türkiye Halk Bankası A.Ş.",
    "EKGYO": "Emlak Konut Gayrimenkul Yatırım Ortaklığı",
    "DOHOL": "Doğan Şirketler Grubu Holding",
    "HEKTS": "Hektaş Ticaret T.A.Ş.",
    "SASA": "Sasa Polyester Sanayi A.Ş.",
    "GUBRF": "Gübre Fabrikaları T.A.Ş.",
    "ODAS": "Odaş Elektrik Üretim Sanayi",
    "KRDMD": "Kardemir Karabük Demir Çelik",
    "ALARK": "Alarko Holding A.Ş.",
    "TAVHL": "TAV Havalimanları Holding",
    "DOAS": "Doğuş Otomotiv Servis ve Ticaret",
    "OYAKC": "Oyak Çimento Fabrikaları",
    "SOKM": "Şok Marketler Ticaret A.Ş.",
    "MGROS": "Migros Ticaret A.Ş.",
    "AEFES": "Anadolu Efes Biracılık ve Malt",
    "TKFEN": "Tekfen Holding A.Ş.",
    "ISGYO": "İş Gayrimenkul Yatırım Ortaklığı",
    "ENJSA": "Enerjisa Enerji A.Ş.",
    "ASTOR": "Astor Enerji A.Ş.",
    "EUPWR": "Europower Enerji",
    "CWENE": "CW Enerji Mühendislik",
    "KMPUR": "Kimteks Poliüretan Sanayi",
    "SMRTG": "Smart Güneş Enerjisi",
    "GESAN": "Girişim Elektrik Sanayi",
    "ALFAS": "Alfa Solar Enerji",
    "MIATK": "Mia Teknoloji",
    "YEOTK": "Yeo Teknoloji Enerji",
    "KONTR": "Kontrolmatik Teknoloji",
    "CRDFA": "Creditwest Faktoring AS"
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