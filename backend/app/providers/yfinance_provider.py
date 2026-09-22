# backend/app/providers/yfinance_provider.py
import yfinance as yf
import pandas as pd
import asyncio
from app.providers.base import BaseDataProvider

class YFinanceProvider(BaseDataProvider):
    """
    yfinance implementation of the BaseDataProvider.
    Uses asyncio.to_thread to prevent blocking the main event loop.
    """

    async def fetch_data(self, symbol: str, period: str = "1mo", interval: str = "1d") -> pd.DataFrame:
        """
        Downloads OHLCV data using yfinance in a non-blocking way.
        BIST symbols typically require '.IS' suffix (e.g., 'GARAN.IS').
        """
        # Define the blocking function
        def _download_data() -> pd.DataFrame:
            # BIST hisseleri için .IS uzantısını garantile
            formatted_symbol = symbol if symbol.endswith(".IS") else f"{symbol}.IS"
            
            # Download data using yfinance
            ticker = yf.Ticker(formatted_symbol)
            df = ticker.history(period=period, interval=interval)
            
            if df.empty:
                raise ValueError(f"No data found for symbol: {symbol}")
                
            # Standardize column names to lowercase for consistency
            df.columns = df.columns.str.lower()
            return df

        # Execute the blocking function in a separate thread
        try:
            dataframe = await asyncio.to_thread(_download_data)
            return dataframe
        except Exception as e:
            # In a production environment, this should be sent to a logging system
            print(f"Error fetching data for {symbol}: {str(e)}")
            raise