from abc import ABC, abstractmethod
import pandas as pd

class BaseDataProvider(ABC):
    """
    Abstract base class for financial data providers.
    Ensures a consistent interface across different data sources.
    """

    @abstractmethod
    async def fetch_data(self, symbol: str, period: str = "1mo", interval: str = "1d") -> pd.DataFrame:
        """
        Fetches historical OHLCV data asynchronously.
        
        Args:
            symbol (str): The ticker symbol (e.g., 'THYAO.IS').
            period (str): The data period to download (e.g., '1mo', '1y').
            interval (str): The data interval (e.g., '1d', '1h').
            
        Returns:
            pd.DataFrame: DataFrame containing OHLCV columns.
        """
        pass