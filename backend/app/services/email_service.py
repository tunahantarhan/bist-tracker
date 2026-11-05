import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(
        self,
        smtp_server: Optional[str] = None,
        port: Optional[int] = None,
        sender_email: Optional[str] = None,
        sender_password: Optional[str] = None,
    ):
        self.smtp_server = smtp_server or settings.SMTP_SERVER
        self.port = int(port or settings.SMTP_PORT)
        self.sender_email = sender_email or settings.SMTP_USER
        self.sender_password = sender_password or settings.SMTP_PASSWORD

    @property
    def is_configured(self) -> bool:
        return bool(self.sender_email and self.sender_password)

    def _send_sync_email(self, to_email: str, subject: str, body: str) -> None:
        if not self.is_configured:
            logger.info("SMTP is not configured; skipping email to %s", to_email)
            return

        msg = MIMEMultipart("alternative")
        msg["From"] = f"BIST Tracker <{self.sender_email}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html", "utf-8"))

        try:
            if self.port == 465:
                with smtplib.SMTP_SSL(self.smtp_server, self.port, timeout=10) as server:
                    server.login(self.sender_email, self.sender_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(self.smtp_server, self.port, timeout=10) as server:
                    server.starttls()
                    server.login(self.sender_email, self.sender_password)
                    server.send_message(msg)
            logger.info("Alert email sent to %s", to_email)
        except Exception as e:
            logger.error("Email delivery failed (%s): %s", to_email, e)

    async def send_alert_email(self, to_email: str, subject: str, body: str) -> None:
        await asyncio.to_thread(self._send_sync_email, to_email, subject, body)
