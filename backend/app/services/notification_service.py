from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import Notification
from app.services.email_service import EmailService

class NotificationService:
    def __init__(self, db: AsyncSession, email_service: EmailService):
        self.db = db
        self.email_service = email_service

    async def trigger_notification(self, user_id: int, rule_id: int, user_email: str, symbol: str, message: str):
        """
        Saves the in-app notification to the database asynchronously 
        and triggers an email alert.
        """
        # 1. Save the in-app notification to the database
        new_notification = Notification(
            user_id=user_id,
            rule_id=rule_id,
            symbol=symbol,
            message=message,
            is_read=False
        )
        self.db.add(new_notification)
        await self.db.commit()
        await self.db.refresh(new_notification)

        # 2. Send the email notification asynchronously
        email_subject = f"BIST Tracker Alarm: {symbol}"
        email_body = f"<h3>Kural Tetiklendi</h3><p>{message}</p>"
        
        await self.email_service.send_alert_email(
            to_email=user_email,
            subject=email_subject,
            body=email_body
        )