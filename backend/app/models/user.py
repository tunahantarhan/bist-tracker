import enum
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text
from app.core.database import Base

class SubscriptionTier(str, enum.Enum):
    FREE = "FREE"         # Free: 3 Stocks
    STANDARD = "STANDARD" # Standard: 10 Stocks
    PREMIUM = "PREMIUM"   # Premium: 50 Stocks

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    first_name: Mapped[str | None] = mapped_column(String(50), nullable=True) # or a proper string definition
    last_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Login is refused until the address is confirmed via the emailed link
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    # Embedded in every session token; incrementing it revokes all existing sessions
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)

    # Admin two-factor authentication (TOTP). The secret is stored before setup is confirmed.
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    # Last accepted time step, so a code cannot be replayed
    totp_last_counter: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    
    # Possible subscription tiers
    tier: Mapped[SubscriptionTier] = mapped_column(Enum(SubscriptionTier), default=SubscriptionTier.FREE, nullable=False)
    
    # Legal acceptance timestamp (Mandatory)
    terms_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )

    # Stocks that are being watched by the user
    watchlist = relationship("Watchlist", back_populates="user", cascade="all, delete-orphan")