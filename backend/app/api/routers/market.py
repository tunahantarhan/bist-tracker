from fastapi import APIRouter
from datetime import datetime
import asyncio
import pandas as pd
import yfinance as yf
from app.providers.yfinance_provider import YFinanceProvider
from app.services.cache_service import CacheService

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

CACHE_KEY_TICKER = "bist_ticker_data_v1"
CACHE_KEY_MACRO = "macro_market_data_v2"
CACHE_TTL_SECONDS = 60

@router.get("/ticker")
async def get_ticker_data():
    # 1. Redis Cache Kontrolü (< 5ms)
    cached = await CacheService.get_json(CACHE_KEY_TICKER)
    if cached:
        return cached

    # 2. Cache Miss -> Toplu Yahoo Finance İndirmesi
    def _fetch_bulk():
        symbols = list(TICKER_INFO.keys())
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
async def get_universe():
    return [{"symbol": k, "name": v} for k, v in TICKER_INFO.items()]