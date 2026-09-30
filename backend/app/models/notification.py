from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, text
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.rule import Rule
    from app.models.user import User

class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Added user_id for SaaS architecture (multi-user isolation)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    rule_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("rules.id", ondelete="SET NULL"), nullable=True)
    
    # Target symbol (e.g., "GARAN") to allow UI redirection
    symbol: Mapped[str | None] = mapped_column(String(16), index=True, nullable=True)
    
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )

    # Relationships
    rule: Mapped["Rule"] = relationship("Rule", back_populates="notifications")
    user: Mapped["User"] = relationship("User")

# Alias for Notification model to avoid naming conflicts
NotificationLog = Notification

class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    
    # Channel type (e.g., "EMAIL", "SMS")
    channel_type: Mapped[str] = mapped_column(String, nullable=False)
    # Destination (e.g., "user@example.com")
    destination: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )

    user: Mapped["User"] = relationship("User")