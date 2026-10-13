from fastapi import APIRouter
from datetime import datetime
import asyncio
import pandas as pd
import yfinance as yf
from app.providers.yfinance_provider import YFinanceProvider

router = APIRouter(prefix="/market", tags=["Market"])
provider = YFinanceProvider()

# Hardcoded universe for the ticker
TICKER_INFO = {
    "AEFES": "Anadolu Efes Biracılık ve Malt",
    "AGHOL": "AG Anadolu Grubu Holding",
    "AKBNK": "Akbank T.A.Ş.",
    "AKSEN": "Aksa Enerji Üretim A.Ş.",
    "ALARK": "Alarko Holding A.Ş.",
    "ALBRK": "Albaraka Türk Katılım Bankası",
    "ALFAS": "Alfa Solar Enerji",
    "ARCLK": "Arçelik A.Ş.",
    "ARDYZ": "ARD Bilişim Teknolojileri",
    "ASELS": "Aselsan Elektronik Sanayi",
    "ASTOR": "Astor Enerji A.Ş.",
    "ASUZU": "Anadolu Isuzu Otomotiv",
    "AYDEM": "Aydem Yenilenebilir Enerji",
    "AYGAZ": "Aygaz A.Ş.",
    "BIMAS": "BİM Birleşik Mağazalar A.Ş.",
    "BIZIM": "Bizim Toptan Satış Mağazaları",
    "BRISA": "Brisa Bridgestone Sabancı",
    "BRSAN": "Borusan Mannesmann Boru",
    "CANTE": "Çan2 Termik A.Ş.",
    "CCOLA": "Coca-Cola İçecek A.Ş.",
    "CEMTS": "Çemtaş Çelik Makina Sanayi",
    "CLEBI": "Çelebi Hava Servisi",
    "CWENE": "CW Enerji Mühendislik",
    "DOAS": "Doğuş Otomotiv Servis ve Ticaret",
    "DOHOL": "Doğan Şirketler Grubu Holding",
    "ECILC": "Eczacıbaşı İlaç",
    "EKGYO": "Emlak Konut Gayrimenkul Yatırım Ortaklığı",
    "ENJSA": "Enerjisa Enerji A.Ş.",
    "ENKAI": "Enka İnşaat ve Sanayi A.Ş.",
    "EREGL": "Ereğli Demir ve Çelik Fabrikaları",
    "EUPWR": "Europower Enerji",
    "EUREN": "Europen Endüstri",
    "FROTO": "Ford Otomotiv Sanayi A.Ş.",
    "GARAN": "Garanti BBVA",
    "GENIL": "Gen İlaç ve Sağlık Ürünleri",
    "GESAN": "Girişim Elektrik Sanayi",
    "GLYHO": "Global Yatırım Holding",
    "GOODY": "Goodyear Lastikleri T.A.Ş.",
    "GOZDE": "Gözde Girişim Sermayesi",
    "GUBRF": "Gübre Fabrikaları T.A.Ş.",
    "GWIND": "Galata Wind Enerji",
    "HALKB": "Türkiye Halk Bankası A.Ş.",
    "HEKTS": "Hektaş Ticaret T.A.Ş.",
    "HLGYO": "Halk Gayrimenkul Yatırım Ortaklığı",
    "HUNER": "Hun Yenilenebilir Enerji",
    "ISCTR": "Türkiye İş Bankası A.Ş.",
    "ISGYO": "İş Gayrimenkul Yatırım Ortaklığı",
    "ISMEN": "İş Yatırım Menkul Değerler",
    "IZMDC": "İzmir Demir Çelik",
    "JANTS": "Jantsa Jant Sanayi",
    "KARSN": "Karsan Otomotiv",
    "KCHOL": "Koç Holding A.Ş.",
    "KFEIN": "Kafein Yazılım",
    "KMPUR": "Kimteks Poliüretan Sanayi",
    "KONTR": "Kontrolmatik Teknoloji",
    "KORDS": "Kordsa Teknik Tekstil",
    "KRDMD": "Kardemir Karabük Demir Çelik",
    "LOGO": "Logo Yazılım",
    "MGROS": "Migros Ticaret A.Ş.",
    "MIATK": "Mia Teknoloji",
    "NETAS": "Netaş Telekomünikasyon",
    "ODAS": "Odaş Elektrik Üretim Sanayi",
    "OTKAR": "Otokar Otomotiv ve Savunma",
    "OYAKC": "Oyak Çimento Fabrikaları",
    "OZKGY": "Özak Gayrimenkul Yatırım Ortaklığı",
    "PAPIL": "Papilon Savunma",
    "PATEK": "Patek Enerji",
    "PETKM": "Petkim Petrokimya Holding A.Ş.",
    "PGSUS": "Pegasus Hava Taşımacılığı A.Ş.",
    "PSGYO": "Pasifik Gayrimenkul Yatırım Ortaklığı",
    "QUAGR": "Qua Granite Hayal Yapı",
    "RTALB": "RTA Laboratuvarları",
    "SAHOL": "Hacı Ömer Sabancı Holding",
    "SASA": "Sasa Polyester Sanayi A.Ş.",
    "SISE": "Türkiye Şişe ve Cam Fabrikaları",
    "SKBNK": "Şekerbank T.A.Ş.",
    "SMRTG": "Smart Güneş Enerjisi",
    "SOKM": "Şok Marketler Ticaret A.Ş.",
    "TATGD": "Tat Gıda",
    "TAVHL": "TAV Havalimanları Holding",
    "TCELL": "Turkcell İletişim Hizmetleri",
    "TKFEN": "Tekfen Holding A.Ş.",
    "TKNSA": "Teknosa İç ve Dış Ticaret",
    "TOASO": "Tofaş Türk Otomobil Fabrikası",
    "TRGYO": "Torunlar Gayrimenkul Yatırım Ortaklığı",
    "TSKB": "Türkiye Sınai Kalkınma Bankası",
    "TTKOM": "Türk Telekomünikasyon A.Ş.",
    "TTRAK": "Türk Traktör ve Ziraat Makineleri",
    "TUKAS": "Tukaş Gıda Sanayi",
    "TUPRS": "Tüpraş Türkiye Petrol Rafinerileri",
    "ULKER": "Ülker Bisküvi Sanayi",
    "VAKBN": "Türkiye Vakıflar Bankası T.A.O.",
    "VBTYZ": "VBT Yazılım",
    "VESBE": "Vestel Beyaz Eşya",
    "VESTL": "Vestel Elektronik",
    "VKGYO": "Vakıf Gayrimenkul Yatırım Ortaklığı",
    "YEOTK": "Yeo Teknoloji Enerji",
    "YKBNK": "Yapı ve Kredi Bankası A.Ş.",
    "ZOREN": "Zorlu Enerji Elektrik Üretim"
}

_ticker_cache = {
    "data": [],
    "last_updated": None
}
CACHE_TTL_SECONDS = 10

@router.get("/ticker")
async def get_ticker_data():
    now = datetime.now()
    
    if _ticker_cache["last_updated"] and (now - _ticker_cache["last_updated"]).total_seconds() < CACHE_TTL_SECONDS:
        return _ticker_cache["data"]

    def _fetch_bulk():
        symbols = list(TICKER_INFO.keys())
        yf_syms_list = [f"{s}.IS" if not s.endswith(".IS") else s for s in symbols]
        yf_syms_str = " ".join(yf_syms_list)
        
        # Download all symbols in exactly 1 HTTP request
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
        _ticker_cache["data"] = valid_results
        _ticker_cache["last_updated"] = now
    
    return _ticker_cache["data"]

@router.get("/universe")
async def get_universe():
    return [{"symbol": k, "name": v} for k, v in TICKER_INFO.items()]