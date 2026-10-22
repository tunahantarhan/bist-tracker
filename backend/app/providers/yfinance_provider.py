import json
import time
import asyncio
import yfinance as yf
import pandas as pd
from typing import List, Dict, Any, Tuple
from app.providers.base import BaseDataProvider

DEFAULT_PERIOD_BY_INTERVAL = {
    "5m": "5d",
    "15m": "5d",
    "1h": "6mo",
    "4h": "6mo",
    "1d": "1y",
    "1wk": "2y",
}

INTRADAY_MAX_PERIODS = {
    "5m": {"5d", "1mo"},
    "15m": {"5d", "1mo"},
    "1h": {"1mo", "3mo", "6mo", "1y", "2y"},
    "4h": {"1mo", "3mo", "6mo", "1y", "2y"},
}

PERIOD_TO_DAYS = {
    "5d": 5,
    "1mo": 31,
    "3mo": 93,
    "6mo": 186,
    "1y": 366,
    "2y": 732,
    "5y": 1826,
}

_master_cache: Dict[str, Tuple[float, int, pd.DataFrame]] = {}
_price_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_CACHE_TTL = 180.0

_symbol_locks: Dict[str, asyncio.Lock] = {}
_yf_semaphore = asyncio.Semaphore(16)


def _get_symbol_lock(symbol: str) -> asyncio.Lock:
    if symbol not in _symbol_locks:
        _symbol_locks[symbol] = asyncio.Lock()
    return _symbol_locks[symbol]


class YFinanceProvider(BaseDataProvider):

    def _format_symbol(self, symbol: str) -> str:
        symbol = symbol.upper().strip()
        # System doesn't append .IS if it's already an index, currency pair (=X) or commodity/future (=F)
        if any(symbol.endswith(suffix) for suffix in [".IS", "=X", "=F"]) or symbol.startswith("^"):
            return symbol
        return f"{symbol}.IS"

    def _slice_by_period(self, df: pd.DataFrame, period: str) -> pd.DataFrame:
        if df.empty or period not in PERIOD_TO_DAYS:
            return df
        days = PERIOD_TO_DAYS[period]
        cutoff = df.index.max() - pd.Timedelta(days=days)
        sliced = df[df.index >= cutoff]
        return sliced if not sliced.empty else df

    def _resample_4h(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
        return (
            df.resample("4h")
            .agg({
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum",
            })
            .dropna(subset=["Close"])
        )

    async def fetch_historical_data(
        self, symbol: str, period: str | None = None, interval: str = "1d"
    ) -> pd.DataFrame:
        formatted_symbol = self._format_symbol(symbol)
        requested_period = period or DEFAULT_PERIOD_BY_INTERVAL.get(interval, "1y")

        effective_interval = interval
        if effective_interval in INTRADAY_MAX_PERIODS:
            allowed = INTRADAY_MAX_PERIODS[effective_interval]
            if requested_period not in allowed:
                if requested_period in {"2y", "5y"}:
                    effective_interval = "1d"
                else:
                    requested_period = DEFAULT_PERIOD_BY_INTERVAL[effective_interval]

        yf_interval = "1h" if effective_interval == "4h" else effective_interval
        req_days = PERIOD_TO_DAYS.get(requested_period, 366)

        fetch_period = requested_period
        if yf_interval == "1h" and req_days < 366:
            fetch_period = "1y"
        elif yf_interval == "1d" and req_days < 732:
            fetch_period = "2y"
        fetch_days = PERIOD_TO_DAYS.get(fetch_period, req_days)

        master_key = f"{formatted_symbol}_{yf_interval}"
        now = time.time()

        # Helper: resample to 4h BEFORE slicing so candle boundaries never shift
        def _prepare_response(raw_df: pd.DataFrame) -> pd.DataFrame:
            if effective_interval == "4h":
                resampled = self._resample_4h(raw_df)
                return self._slice_by_period(resampled, requested_period)
            return self._slice_by_period(raw_df, requested_period)

        # 1. Fast path: Serve directly from RAM
        if master_key in _master_cache:
            cached_time, cached_days, cached_df = _master_cache[master_key]
            if now - cached_time < _CACHE_TTL and cached_days >= req_days and not cached_df.empty:
                return _prepare_response(cached_df)

        # 2. Network path
        sym_lock = _get_symbol_lock(master_key)
        async with sym_lock:
            now = time.time()
            if master_key in _master_cache:
                cached_time, cached_days, cached_df = _master_cache[master_key]
                if now - cached_time < _CACHE_TTL and cached_days >= req_days and not cached_df.empty:
                    return _prepare_response(cached_df)

            def _fetch():
                ticker = yf.Ticker(formatted_symbol)
                return ticker.history(period=fetch_period, interval=yf_interval)

            async with _yf_semaphore:
                df = await asyncio.to_thread(_fetch)

            if df is None or df.empty:
                return pd.DataFrame()

            _master_cache[master_key] = (time.time(), fetch_days, df.copy())
            return _prepare_response(df)

    async def fetch_current_price(self, symbol: str) -> Dict[str, Any]:
        formatted_symbol = self._format_symbol(symbol)
        now = time.time()

        if formatted_symbol in _price_cache:
            cached_time, cached_data = _price_cache[formatted_symbol]
            if now - cached_time < 30.0:
                return cached_data

        def _fetch_info():
            ticker = yf.Ticker(formatted_symbol)
            return ticker.fast_info

        async with _yf_semaphore:
            info = await asyncio.to_thread(_fetch_info)

        current_price = info.get("lastPrice", 0.0)
        previous_close = info.get("previousClose", 0.0)

        change_pct = 0.0
        if previous_close > 0:
            change_pct = ((current_price - previous_close) / previous_close) * 100

        result = {
            "symbol": symbol.replace(".IS", ""),
            "current_price": round(current_price, 2),
            "change_pct": round(change_pct, 2),
        }
        _price_cache[formatted_symbol] = (time.time(), result)
        return result

    async def fetch_stock_data(self, symbol: str, interval: str = "15m", period: str = "1mo") -> List[Dict[str, Any]]:
        df = await self.fetch_historical_data(symbol=symbol, period=period, interval=interval)
        if df.empty:
            return []

        df = df.reset_index()
        df = df.fillna(0)

        if "Datetime" in df.columns:
            df["Datetime"] = df["Datetime"].astype(str)
            df.rename(columns={"Datetime": "Date"}, inplace=True)
        elif "Date" in df.columns:
            df["Date"] = df["Date"].astype(str)

        return json.loads(df.to_json(orient="records"))

    async def fetch_active_universe(self) -> List[str]:
        return ["THYAO", "AKBNK", "KCHOL", "TUPRS", "GARAN"]