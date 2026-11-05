from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.core.market_hours import now_tr_naive


class UserCustomAlert(Base):
    __tablename__ = "user_custom_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("rules.id", ondelete="CASCADE"), nullable=True)
    timeframe = Column(String(10), default="15m")
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime, nullable=True)
    # Stored as naive Turkey local time (column has no timezone)
    created_at = Column(DateTime, default=now_tr_naive)

    user = relationship("User", backref="custom_alerts")
    rule = relationship("Rule")