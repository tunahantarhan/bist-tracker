"""Consistency check for displayed prices against the running API.

    python -m app.scripts.verify_prices                 # 20 most liquid symbols
    python -m app.scripts.verify_prices THYAO DOAS      # specific symbols
    python -m app.scripts.verify_prices --api http://host/api/v1

For each symbol it compares, through the public API:
  * ticker band price, overview price, detail page price,
  * the last candle of the 1h / 1d charts (must equal the displayed price),
  * the detail page's previous close vs Yahoo's official daily close series,
and prints a table; the exit code is non-zero when anything disagrees.
"""

import argparse
import json
import sys
import urllib.request

import yfinance as yf

TOLERANCE = 0.011  # prices are rounded to 2 decimals


def _get(api: str, path: str):
    with urllib.request.urlopen(f"{api}{path}", timeout=60) as resp:
        return json.loads(resp.read())


def _close(a: float | None, b: float | None) -> bool:
    return a is not None and b is not None and abs(a - b) <= TOLERANCE


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("symbols", nargs="*")
    parser.add_argument("--api", default="http://127.0.0.1:8000/api/v1")
    args = parser.parse_args()

    ticker = {t["symbol"]: t for t in _get(args.api, "/market/ticker")}
    overview = {i["symbol"]: i for i in _get(args.api, "/market/overview")["items"]}
    symbols = [s.upper() for s in args.symbols] or list(ticker)[:20]

    failures = 0
    print(f"{'Sembol':8} {'Ticker':>10} {'Overview':>10} {'Detay':>10} {'1S mum':>10} {'1G mum':>10} "
          f"{'Önc.kap.':>10} {'Resmi önc.':>10}  Sonuç")
    for sym in symbols:
        hourly = _get(args.api, f"/market/{sym}?interval=1h&period=1mo")
        daily = _get(args.api, f"/market/{sym}?interval=1d&period=6mo")
        price = hourly["current_price"]
        official = yf.Ticker(f"{sym}.IS").history(period="10d", interval="1d", auto_adjust=False)["Close"]
        # official previous close = last completed session before the price's session
        price_day = None
        if hourly.get("price_time"):
            import pandas as pd

            price_day = pd.Timestamp(hourly["price_time"], unit="s", tz="UTC").tz_convert("Europe/Istanbul").normalize()
        prev_official = None
        if price_day is not None:
            before = official[official.index.normalize() < price_day]
            prev_official = round(float(before.iloc[-1]), 2) if len(before) else None

        values = {
            "ticker": ticker.get(sym, {}).get("current_price"),
            "overview": overview.get(sym, {}).get("current_price"),
            "detail": price,
            "candle_1h": hourly["candles"][-1]["close"] if hourly.get("candles") else None,
            "candle_1d": daily["candles"][-1]["close"] if daily.get("candles") else None,
        }
        problems = [k for k, v in values.items() if v is not None and not _close(v, price)]
        if not _close(hourly.get("prev_close"), prev_official):
            problems.append("prev_close")
        failures += bool(problems)

        def f(v):
            return f"{v:10.2f}" if isinstance(v, (int, float)) else f"{'—':>10}"

        print(f"{sym:8} {f(values['ticker'])} {f(values['overview'])} {f(price)} {f(values['candle_1h'])} "
              f"{f(values['candle_1d'])} {f(hourly.get('prev_close'))} {f(prev_official)}  "
              f"{'OK' if not problems else 'FARK: ' + ', '.join(problems)}")

    print(f"\n{len(symbols) - failures}/{len(symbols)} tutarlı")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
