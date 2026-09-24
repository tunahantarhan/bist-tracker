import asyncio
import yfinance as yf
import pandas as pd
from app.providers.base import BaseDataProvider

class YFinanceProvider(BaseDataProvider):
    async def fetch_data(self, symbol: str, period: str = "1mo", interval: str = "15m") -> pd.DataFrame:
        """
        Since yfinance performs blocking I/O, we run it asynchronously using asyncio.to_thread to avoid blocking the FastAPI event loop.
        It's needed to add ".IS" suffix to BIST stock symbols (THYAO.IS, GARAN.IS, etc.) to fetch data from Yahoo Finance.
        """
        ticker_symbol = f"{symbol}.IS" if not symbol.endswith(".IS") else symbol
        
        loop = asyncio.get_event_loop()
        ticker = yf.Ticker(ticker_symbol)
        
        # Fetch the data from the background thread
        df = await loop.run_in_executor(
            None, 
            lambda: ticker.history(period=period, interval=interval)
        )
        
        if df.empty:
            raise ValueError(f"{ticker_symbol} için veri bulunamadı.")
            
        return df