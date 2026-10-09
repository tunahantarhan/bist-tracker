from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class UniverseStock(Base):
    __tablename__ = "universe_stocks"

    symbol: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)