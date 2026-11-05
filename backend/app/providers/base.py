from abc import ABC, abstractmethod

import pandas as pd


class BaseDataProvider(ABC):
    """Market data source. Implementations must be async and return OHLCV frames indexed by time."""

    @abstractmethod
    async def fetch_historical_data(self, symbol: str, period: str | None = None, interval: str = "1d") -> pd.DataFrame:
        ...
