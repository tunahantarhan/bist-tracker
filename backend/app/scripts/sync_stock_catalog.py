"""Regenerates `app/core/stock_catalog.py` from Yahoo's equity screener (exchange = IST).

    python -m app.scripts.sync_stock_catalog                 # rewrite the catalog file
    python -m app.scripts.sync_stock_catalog --activate-all  # ...and scan every catalog stock

Curated (hand-written, properly accented) names in the existing catalog are kept; new
symbols get Yahoo's ASCII long name with common Turkish words restored. Symbols that
have not traded recently or have (almost) no volume are left out.
"""

import argparse
import asyncio
import re
import time
from pathlib import Path

import yfinance as yf
from yfinance import EquityQuery

from app.core.stock_catalog import STOCK_CATALOG

CATALOG_PATH = Path(__file__).resolve().parents[1] / "core" / "stock_catalog.py"
PAGE_SIZE = 250
MAX_IDLE_DAYS = 7
MIN_AVG_VOLUME = 1_000  # shares / day over 3 months

# Yahoo serves BIST company names without Turkish characters
TR_WORDS = {
    "anonim": "Anonim", "sirketi": "Şirketi", "ortakligi": "Ortaklığı", "yatirim": "Yatırım",
    "yatirimlari": "Yatırımları", "yatirimlar": "Yatırımlar", "uretim": "Üretim", "uretimi": "Üretimi",
    "urunleri": "Ürünleri", "gida": "Gıda", "insaat": "İnşaat", "celik": "Çelik", "cimento": "Çimento",
    "bankasi": "Bankası", "isletmeleri": "İşletmeleri", "isletmeciligi": "İşletmeciliği",
    "dagitim": "Dağıtım", "ilac": "İlaç", "saglik": "Sağlık", "kagit": "Kağıt", "muhendislik": "Mühendislik",
    "tasimacilik": "Taşımacılık", "tasimaciligi": "Taşımacılığı", "dis": "Dış", "gelistirme": "Geliştirme",
    "donanim": "Donanım", "bilisim": "Bilişim", "iletisim": "İletişim", "egitim": "Eğitim",
    "hayvancilik": "Hayvancılık", "tarim": "Tarım", "yag": "Yağ", "sut": "Süt", "seker": "Şeker",
    "doküm": "Döküm", "dokum": "Döküm", "makine": "Makine", "makina": "Makina", "musavirlik": "Müşavirlik",
    "danismanlik": "Danışmanlık", "yonetim": "Yönetim", "turk": "Türk", "turkiye": "Türkiye",
    "istanbul": "İstanbul", "izmir": "İzmir", "kimyevi": "Kimyevi", "mamulleri": "Mamulleri",
    "orme": "Örme", "ortaklik": "Ortaklık", "katilim": "Katılım", "menkul": "Menkul", "degerler": "Değerler",
    "degerleri": "Değerleri", "gayrimenkul": "Gayrimenkul", "girisim": "Girişim", "sermayesi": "Sermayesi",
    "yapi": "Yapı", "malzemeleri": "Malzemeleri", "elektrik": "Elektrik", "ticaret": "Ticaret",
    "sanayi": "Sanayi", "sanayii": "Sanayii", "ve": "ve", "hizmetleri": "Hizmetleri", "uluslararasi": "Uluslararası",
    "cam": "Cam", "aksesuar": "Aksesuar", "giyim": "Giyim", "dokuma": "Dokuma", "iplik": "İplik",
    "ithalat": "İthalat", "ihracat": "İhracat", "imalat": "İmalat", "kiymetli": "Kıymetli",
    "madenleri": "Madenleri", "madencilik": "Madencilik", "liman": "Liman", "havacilik": "Havacılık",
    "otelcilik": "Otelcilik", "kultur": "Kültür", "sigortasi": "Sigortası", "emeklilik": "Emeklilik",
    "hayat": "Hayat", "boya": "Boya", "plastik": "Plastik", "ambalaj": "Ambalaj", "agac": "Ağaç",
    "koop": "Koop", "birligi": "Birliği", "guc": "Güç", "gubre": "Gübre", "gubreleri": "Gübreleri",
    "fabrikalari": "Fabrikaları", "fabrikasi": "Fabrikası", "kablo": "Kablo", "beyaz": "Beyaz", "esya": "Eşya",
    "otomotiv": "Otomotiv", "lojistik": "Lojistik", "petrol": "Petrol", "rafinerileri": "Rafinerileri",
    "magazalari": "Mağazaları", "magazacilik": "Mağazacılık", "pazarlama": "Pazarlama", "satis": "Satış",
    "teknolojileri": "Teknolojileri", "teknoloji": "Teknoloji", "yazilim": "Yazılım", "cozumleri": "Çözümleri",
    "enerji": "Enerji", "yenilenebilir": "Yenilenebilir", "dogal": "Doğal", "dogalgaz": "Doğalgaz",
    "kiralama": "Kiralama", "finansal": "Finansal", "faktoring": "Faktoring", "holding": "Holding",
    "grubu": "Grubu", "gelisim": "Gelişim", "seramik": "Seramik", "porselen": "Porselen", "mobilya": "Mobilya",
    "deri": "Deri", "tekstil": "Tekstil", "konfeksiyon": "Konfeksiyon", "hali": "Halı", "kagitcilik": "Kağıtçılık",
}

ACRONYM_RE = re.compile(r"^[A-Z0-9&.\-]{2,5}$")


def prettify_name(raw: str) -> str:
    raw = re.sub(r"\s+", " ", raw.strip())
    raw = re.sub(r"\bA\.?\s?S\.?$", "A.Ş.", raw)
    raw = re.sub(r"\bT\.?\s?A\.?\s?S\.?$", "T.A.Ş.", raw)
    words = []
    for word in raw.split(" "):
        key = word.lower().strip(",")
        if key in TR_WORDS:
            words.append(TR_WORDS[key] + ("," if word.endswith(",") else ""))
        elif ACRONYM_RE.match(word) or "." in word:
            words.append(word)  # tickers, acronyms, A.Ş.
        else:
            words.append(word[:1].upper() + word[1:].lower() if word.isupper() else word)
    name = " ".join(words)
    return name.replace("Anonim Şirketi", "A.Ş.")


def fetch_screener() -> list[dict]:
    query = EquityQuery("eq", ["exchange", "IST"])
    quotes: list[dict] = []
    offset = 0
    while True:
        page = yf.screen(query, size=PAGE_SIZE, offset=offset, sortField="ticker", sortAsc=True)
        rows = page.get("quotes", [])
        quotes.extend(rows)
        if len(rows) < PAGE_SIZE:
            return quotes
        offset += PAGE_SIZE
        time.sleep(1.0)


def build_catalog(quotes: list[dict]) -> tuple[dict[str, str], list[str]]:
    now = time.time()
    catalog: dict[str, str] = {}
    skipped: list[str] = []
    for q in quotes:
        yf_symbol = q.get("symbol", "")
        if not yf_symbol.endswith(".IS"):
            continue
        symbol = yf_symbol[:-3]
        idle_days = (now - (q.get("regularMarketTime") or 0)) / 86400
        avg_volume = q.get("averageDailyVolume3Month") or 0
        if idle_days > MAX_IDLE_DAYS or avg_volume < MIN_AVG_VOLUME:
            skipped.append(f"{symbol} (idle {idle_days:.0f}g, hacim {avg_volume})")
            continue
        curated = STOCK_CATALOG.get(symbol)
        catalog[symbol] = curated or prettify_name(q.get("longName") or q.get("shortName") or symbol)
    return dict(sorted(catalog.items())), skipped


def write_catalog(catalog: dict[str, str]) -> None:
    lines = [
        '"""Static BIST stock catalog (symbol -> company name) used for names, search and the ticker band.',
        "",
        "Generated by `python -m app.scripts.sync_stock_catalog` from Yahoo's equity screener;",
        "hand-written names are preserved on regeneration. The actively scanned universe is",
        "stored in the `universe_stocks` table and managed from the admin panel.",
        '"""',
        "",
        "STOCK_CATALOG: dict[str, str] = {",
        *[f"    {sym!r}: {name!r}," for sym, name in catalog.items()],
        "}",
        "",
    ]
    CATALOG_PATH.write_text("\n".join(lines), encoding="utf-8")


async def activate_all(symbols: list[str]) -> None:
    from sqlalchemy import update
    from sqlalchemy.dialects.postgresql import insert

    from app.core.database import AsyncSessionLocal
    from app.models.universe import UniverseStock

    async with AsyncSessionLocal() as db:
        await db.execute(update(UniverseStock).values(is_active=False))
        stmt = insert(UniverseStock).values([{"symbol": s, "is_active": True} for s in symbols])
        await db.execute(stmt.on_conflict_do_update(index_elements=["symbol"], set_={"is_active": True}))
        await db.commit()
    from app.services.cache_service import redis_client
    from app.services.market_service import invalidate_market_caches

    await invalidate_market_caches(rescan=False)
    await redis_client.aclose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--activate-all", action="store_true", help="mark every catalog stock as scanned")
    args = parser.parse_args()

    quotes = fetch_screener()
    catalog, skipped = build_catalog(quotes)
    if len(catalog) < 300:
        raise SystemExit(f"Screener returned only {len(catalog)} usable symbols; refusing to shrink the catalog.")
    write_catalog(catalog)
    added = sorted(set(catalog) - set(STOCK_CATALOG))
    removed = sorted(set(STOCK_CATALOG) - set(catalog))
    print(f"Catalog: {len(catalog)} symbols (+{len(added)} / -{len(removed)}), skipped {len(skipped)}")
    for line in skipped:
        print("  skipped:", line)
    if removed:
        print("  removed:", ", ".join(removed))

    if args.activate_all:
        asyncio.run(activate_all(list(catalog)))
        print(f"Universe: {len(catalog)} symbols active")


if __name__ == "__main__":
    main()
