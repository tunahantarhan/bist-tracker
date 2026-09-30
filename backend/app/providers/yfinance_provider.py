import json
import asyncio
import yfinance as yf
import pandas as pd
from typing import List, Dict, Any
from app.providers.base import BaseDataProvider

class YFinanceProvider(BaseDataProvider):
    
    def _format_symbol(self, symbol: str) -> str:
        symbol = symbol.upper()
        if not symbol.endswith(".IS"):
            return f"{symbol}.IS"
        return symbol

    # --- NEW METHODS ---
    
    async def fetch_historical_data(self, symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
        formatted_symbol = self._format_symbol(symbol)
        
        def _fetch():
            ticker = yf.Ticker(formatted_symbol)
            return ticker.history(period=period, interval=interval)
            
        df = await asyncio.to_thread(_fetch)
        
        if df.empty:
            return pd.DataFrame()
            
        return df

    async def fetch_current_price(self, symbol: str) -> Dict[str, Any]:
        formatted_symbol = self._format_symbol(symbol)
        
        def _fetch_info():
            ticker = yf.Ticker(formatted_symbol)
            return ticker.fast_info
            
        info = await asyncio.to_thread(_fetch_info)
        
        current_price = info.get("lastPrice", 0.0)
        previous_close = info.get("previousClose", 0.0)
        
        change_pct = 0.0
        if previous_close > 0:
            change_pct = ((current_price - previous_close) / previous_close) * 100
            
        return {
            "symbol": symbol.replace(".IS", ""),
            "current_price": round(current_price, 2),
            "change_pct": round(change_pct, 2)
        }
    # --- NEW METHODS ---

    # --- OLD METHODS ---
    
    async def fetch_stock_data(self, symbol: str, interval: str = "15m", period: str = "1mo") -> List[Dict[str, Any]]:
        formatted_symbol = self._format_symbol(symbol)
        
        def _fetch():
            ticker = yf.Ticker(formatted_symbol)
            return ticker.history(period=period, interval=interval)
            
        df = await asyncio.to_thread(_fetch)
        
        if df.empty:
            return []
    
        df = df.reset_index()
        df = df.fillna(0)
        
        if 'Datetime' in df.columns:
            df['Datetime'] = df['Datetime'].astype(str)
            df.rename(columns={'Datetime': 'Date'}, inplace=True)
        elif 'Date' in df.columns:
            df['Date'] = df['Date'].astype(str)
            
        parsed_json = json.loads(df.to_json(orient="records"))
        return parsed_json

    async def fetch_active_universe(self) -> List[str]:
        return ["THYAO", "AKBNK", "KCHOL", "TUPRS", "GARAN"]