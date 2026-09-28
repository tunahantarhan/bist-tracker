import json
import asyncio
import yfinance as yf
import pandas as pd
from typing import List, Dict, Any
from app.providers.base import BaseDataProvider

class YFinanceProvider(BaseDataProvider):
    async def fetch_stock_data(self, symbol: str, interval: str = "15m", period: str = "1mo") -> List[Dict[str, Any]]:
        ticker_symbol = f"{symbol}.IS" if not symbol.endswith(".IS") else symbol
        
        loop = asyncio.get_event_loop()
        ticker = yf.Ticker(ticker_symbol)
        
        # 1. Fetching data as a Pandas DataFrame
        df = await loop.run_in_executor(
            None, 
            lambda: ticker.history(period=period, interval=interval)
        )
        
        # 2. DataFrame check (Since it hasn't been converted to a Python list yet, .empty works fine)
        if df.empty:
            return []
    
        # 3. Standartization of the data in order to avoid errors
        df = df.reset_index()
        df = df.fillna(0)
        
        if 'Datetime' in df.columns:
            df['Datetime'] = df['Datetime'].astype(str)
            df.rename(columns={'Datetime': 'Date'}, inplace=True)
        elif 'Date' in df.columns:
            df['Date'] = df['Date'].astype(str)
            
        # 4. After all operations are completed, we safely convert to JSON/List format and export
        parsed_json = json.loads(df.to_json(orient="records"))
        return parsed_json

    async def fetch_active_universe(self) -> List[str]:
        return ["THYAO", "AKBNK", "KCHOL", "TUPRS", "GARAN"]