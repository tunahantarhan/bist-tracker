from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

TR_TZ = timezone(timedelta(hours=3))

def get_tr_now():
    """Returns current Turkey local time as timezone-naive datetime."""
    return datetime.now(TR_TZ).replace(tzinfo=None)


class UserCustomAlert(Base):
    __tablename__ = "user_custom_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    rule_id = Column(Integer, ForeignKey("rules.id", ondelete="CASCADE"), nullable=True)
    timeframe = Column(String(10), default="15m")
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=get_tr_now)

    user = relationship("User", backref="custom_alerts")
    rule = relationship("Rule")