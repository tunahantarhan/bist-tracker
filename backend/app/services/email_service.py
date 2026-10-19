import os
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from pathlib import Path


def _load_env_fallback():
    """Reads .env automatically without requiring external third-party packages."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        current_dir = Path(__file__).resolve().parent
        for candidate in [current_dir, current_dir.parent, current_dir.parent.parent]:
            env_file = candidate / ".env"
            if env_file.exists():
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip("'").strip('"')
                            if k not in os.environ:
                                os.environ[k] = v
                break


_load_env_fallback()


class EmailService:
    def __init__(
        self,
        smtp_server: Optional[str] = None,
        port: Optional[int] = None,
        sender_email: Optional[str] = None,
        sender_password: Optional[str] = None,
    ):
        _load_env_fallback()
        self.smtp_server = smtp_server or os.getenv("SMTP_SERVER", "smtp.gmail.com")
        self.port = int(os.getenv("SMTP_PORT") or port or 465)
        self.sender_email = sender_email or os.getenv("SMTP_USER", "")
        self.sender_password = sender_password or os.getenv("SMTP_PASSWORD", "")

    def _send_sync_email(self, to_email: str, subject: str, body: str):
        if not self.sender_email or not self.sender_password:
            print("[MAIL WARNING] SMTP_USER veya SMTP_PASSWORD tanımlı değil. E-posta gönderimi atlandı.")
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

            print(f"[MAIL SUCCESS] Alarm e-postası başarıyla gönderildi: {to_email}")
        except Exception as e:
            print(f"[MAIL ERROR] E-posta gönderim hatası ({to_email}): {e}")

    async def send_alert_email(self, to_email: str, subject: str, body: str):
        await asyncio.to_thread(self._send_sync_email, to_email, subject, body)