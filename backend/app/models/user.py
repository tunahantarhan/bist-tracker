import enum
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text
from app.core.database import Base

class SubscriptionTier(str, enum.Enum):
    FREE = "FREE"         # Ücretsiz: 3 Hisse
    STANDARD = "STANDARD" # Standart: 10 Hisse
    PREMIUM = "PREMIUM"   # Premium: 50 Hisse

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Possible subscription tiers
    tier: Mapped[SubscriptionTier] = mapped_column(Enum(SubscriptionTier), default=SubscriptionTier.FREE, nullable=False)
    
    # Legal acceptance timestamp (Mandatory)
    terms_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )

    # Stocks that are being watched by the user
    watchlist = relationship("Watchlist", back_populates="user", cascade="all, delete-orphan")