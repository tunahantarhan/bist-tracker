from abc import ABC, abstractmethod
from typing import List, Dict, Any

class BaseDataProvider(ABC):
    @abstractmethod
    async def fetch_stock_data(self, symbol: str, interval: str = "15m", period: str = "1mo") -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def fetch_active_universe(self) -> List[str]:
        pass