from abc import ABC, abstractmethod
from typing import List, Dict, Any
import pandas as pd

class BaseDataProvider(ABC):
    # NEW METHODS (For Pandas Scoring and Ticker)
    @abstractmethod
    async def fetch_historical_data(self, symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
        pass

    @abstractmethod
    async def fetch_current_price(self, symbol: str) -> Dict[str, Any]:
        pass

    # OLD METHODS (Kept to avoid breaking existing rules.py)
    @abstractmethod
    async def fetch_stock_data(self, symbol: str, interval: str = "15m", period: str = "1mo") -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def fetch_active_universe(self) -> List[str]:
        pass