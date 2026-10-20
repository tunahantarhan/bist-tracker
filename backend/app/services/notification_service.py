import time
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import Notification
from app.services.email_service import EmailService
from app.services.cache_service import CacheService

# In-memory cooldown backup in case Redis is momentarily unavailable
_LOCAL_COOLDOWN: dict[str, float] = {}


class NotificationService:
    # Dynamic cooldown lookup table based on rule timeframe (in seconds)
    TIMEFRAME_COOLDOWNS = {
        "5m": 30 * 60,      # 30 minutes
        "15m": 60 * 60,     # 1 hour (4 candles)
        "1h": 1.5 * 3600,     # 1.5 hours
        "4h": 4 * 3600,     # 4 hours
        "1d": 24 * 3600,    # 24 hours (1 full trading day)
    }

    def __init__(self, db: AsyncSession, email_service: Optional[EmailService] = None):
        self.db = db
        self.email_service = email_service or EmailService()

    def get_cooldown_seconds(self, timeframe: Optional[str]) -> int:
        """Returns the appropriate cooldown period in seconds for the given timeframe."""
        if not timeframe:
            return 3600
        return self.TIMEFRAME_COOLDOWNS.get(timeframe.lower(), 3600)

    async def is_on_cooldown(
        self, 
        user_id: int, 
        symbol: str, 
        timeframe: Optional[str] = None,
        rule_id: Optional[int] = None
    ) -> bool:
        """
        Verifies cooldown using Redis/Memory cache.
        User clearing their UI inbox will NOT reset this lock!
        """
        key = f"bist_cooldown:{user_id}:{symbol.upper()}"

        # 1. Fast Redis check
        cached = await CacheService.get_json(key)
        if cached:
            return True

        # 2. In-memory fallback check
        cooldown_limit = self.get_cooldown_seconds(timeframe)
        now = time.time()
        if key in _LOCAL_COOLDOWN and (now - _LOCAL_COOLDOWN[key]) < cooldown_limit:
            return True

        return False

    async def set_cooldown(
        self, 
        user_id: int, 
        symbol: str, 
        timeframe: Optional[str] = None
    ):
        """Locks the symbol independently of notification table rows."""
        key = f"bist_cooldown:{user_id}:{symbol.upper()}"
        cooldown_seconds = self.get_cooldown_seconds(timeframe)
        
        _LOCAL_COOLDOWN[key] = time.time()
        await CacheService.set_json(key, {"locked": True}, expiration=cooldown_seconds)

    async def trigger_notification(
        self,
        user_id: int,
        symbol: str,
        message: str,
        rule_id: Optional[int] = None,
        user_email: Optional[str] = None,
        force: bool = False,
        timeframe: Optional[str] = None
    ) -> Optional[Notification]:
        clean_sym = symbol.upper()

        # 1. Dynamic Cooldown Guard based on rule timeframe
        if not force and await self.is_on_cooldown(user_id, clean_sym, timeframe, rule_id):
            return None

        # 2. Lock immediately so clearing inbox later won't revive it
        await self.set_cooldown(user_id, clean_sym, timeframe)

        # 3. Create inbox notification
        new_notification = Notification(
            user_id=user_id,
            rule_id=rule_id,
            symbol=clean_sym,
            message=message,
            is_read=False
        )
        self.db.add(new_notification)
        await self.db.commit()
        await self.db.refresh(new_notification)

        # 4. Asynchronously send email alert
        if user_email:
            try:
                tf_short_map = {
                    "5m": "5Dk",
                    "15m": "15Dk",
                    "1h": "1S",
                    "4h": "4S",
                    "1d": "1G"
                }
                tf_badge = tf_short_map.get((timeframe or "4h").lower(), (timeframe or "4h").upper())

                subject = f"🚀 BIST Alarm ({tf_badge}): {clean_sym} Kırılım Gerçekleşti"
                html_body = f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: auto; padding: 24px; background: #0b0e14; color: #e2e8f0; border-radius: 12px; border: 1px solid #1e293b;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                        <span style="background: #2563eb; color: #ffffff; font-weight: 900; font-family: monospace; padding: 6px 12px; border-radius: 6px; font-size: 14px;">BIST Tracker</span>
                        <span style="background: #f59e0b20; color: #f59e0b; border: 1px solid #f59e0b40; font-weight: 700; font-family: monospace; padding: 4px 10px; border-radius: 6px; font-size: 12px;">{tf_badge} Periyot</span>
                    </div>
                    <h2 style="color: #ffffff; font-size: 18px; margin-top: 0;">Sinyal Alarmı: <span style="color: #60a5fa;">{clean_sym}</span></h2>
                    <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">{message}</p>
                    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b;">
                        <a href="http://localhost:3000/detay/{clean_sym}" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 10px 18px; border-radius: 8px;">Grafiği İncele →</a>
                    </div>
                </div>
                """
                await self.email_service.send_alert_email(
                    to_email=user_email,
                    subject=subject,
                    body=html_body
                )
            except Exception as mail_err:
                print(f"[MAIL WARNING] Failed to send email alert to {user_email}: {mail_err}")

        return new_notification