import html
import logging
import time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification import Notification
from app.services.cache_service import CacheService
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

# In-memory cooldown backup in case Redis is momentarily unavailable
_LOCAL_COOLDOWN: dict[str, float] = {}

TIMEFRAME_SHORT_LABELS = {"5m": "5Dk", "15m": "15Dk", "1h": "1S", "4h": "4S", "1d": "1G"}


class NotificationService:
    # Cooldown per timeframe (seconds): one alert per symbol/rule roughly per candle
    TIMEFRAME_COOLDOWNS = {
        "5m": 30 * 60,
        "15m": 60 * 60,
        "1h": 90 * 60,
        "4h": 4 * 3600,
        "1d": 24 * 3600,
    }
    DEFAULT_COOLDOWN = 3600

    def __init__(self, db: AsyncSession, email_service: Optional[EmailService] = None):
        self.db = db
        self.email_service = email_service or EmailService()

    def get_cooldown_seconds(self, timeframe: Optional[str]) -> int:
        if not timeframe:
            return self.DEFAULT_COOLDOWN
        return int(self.TIMEFRAME_COOLDOWNS.get(timeframe.lower(), self.DEFAULT_COOLDOWN))

    @staticmethod
    def _cooldown_key(user_id: int, symbol: str, rule_id: Optional[int]) -> str:
        return f"bist_cooldown:{user_id}:{symbol.upper()}:{rule_id or 0}"

    async def is_on_cooldown(
        self, user_id: int, symbol: str, timeframe: Optional[str] = None, rule_id: Optional[int] = None
    ) -> bool:
        """Cooldown lives in Redis (+ memory fallback), so clearing the inbox does not re-arm alerts."""
        key = self._cooldown_key(user_id, symbol, rule_id)
        if await CacheService.get_json(key):
            return True
        last = _LOCAL_COOLDOWN.get(key)
        return last is not None and (time.time() - last) < self.get_cooldown_seconds(timeframe)

    async def set_cooldown(
        self, user_id: int, symbol: str, timeframe: Optional[str] = None, rule_id: Optional[int] = None
    ) -> None:
        key = self._cooldown_key(user_id, symbol, rule_id)
        _LOCAL_COOLDOWN[key] = time.time()
        await CacheService.set_json(key, {"locked": True}, expiration=self.get_cooldown_seconds(timeframe))

    async def trigger_notification(
        self,
        user_id: int,
        symbol: str,
        message: str,
        rule_id: Optional[int] = None,
        user_email: Optional[str] = None,
        force: bool = False,
        timeframe: Optional[str] = None,
    ) -> Optional[Notification]:
        clean_sym = symbol.upper()

        if not force and await self.is_on_cooldown(user_id, clean_sym, timeframe, rule_id):
            return None
        await self.set_cooldown(user_id, clean_sym, timeframe, rule_id)

        notification = Notification(
            user_id=user_id,
            rule_id=rule_id,
            symbol=clean_sym,
            message=message,
            is_read=False,
        )
        self.db.add(notification)
        await self.db.commit()
        await self.db.refresh(notification)

        if user_email:
            try:
                await self._send_email(user_email, clean_sym, message, timeframe)
            except Exception as e:
                logger.warning("Email alert to %s failed: %s", user_email, e)

        return notification

    async def _send_email(self, to_email: str, symbol: str, message: str, timeframe: Optional[str]) -> None:
        tf = (timeframe or "4h").lower()
        tf_badge = TIMEFRAME_SHORT_LABELS.get(tf, tf.upper())
        detail_url = f"{settings.FRONTEND_URL.rstrip('/')}/detay/{symbol}"
        safe_message = html.escape(message)

        subject = f"BIST Alarm ({tf_badge}): {symbol} kuralı sağladı"
        html_body = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: auto; padding: 24px; background: #0b0e14; color: #e2e8f0; border-radius: 12px; border: 1px solid #1e293b;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                <span style="background: #2563eb; color: #ffffff; font-weight: 900; font-family: monospace; padding: 6px 12px; border-radius: 6px; font-size: 14px;">BIST Tracker</span>
                <span style="background: #f59e0b20; color: #f59e0b; border: 1px solid #f59e0b40; font-weight: 700; font-family: monospace; padding: 4px 10px; border-radius: 6px; font-size: 12px;">{tf_badge} Periyot</span>
            </div>
            <h2 style="color: #ffffff; font-size: 18px; margin-top: 0;">Sinyal Alarmı: <span style="color: #60a5fa;">{symbol}</span></h2>
            <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">{safe_message}</p>
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b;">
                <a href="{detail_url}" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 10px 18px; border-radius: 8px;">Grafiği İncele →</a>
            </div>
            <p style="font-size: 11px; color: #64748b; margin-top: 24px;">Bu bildirim yatırım tavsiyesi değildir; yalnızca tanımlı matematiksel koşulların gerçekleştiğini bildirir.</p>
        </div>
        """
        await self.email_service.send_alert_email(to_email=to_email, subject=subject, body=html_body)
