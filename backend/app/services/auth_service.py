"""Account e-mails (verification, password reset) and their signed tokens."""

import logging
from datetime import datetime, timedelta, timezone
from html import escape

from app.core.config import settings
from app.core.security import (
    EMAIL_VERIFY_TOKEN_TYPE,
    PASSWORD_RESET_TOKEN_TYPE,
    create_token,
    password_fingerprint,
)
from app.models.user import User
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

_email_service = EmailService()


def create_email_verify_token(user: User) -> str:
    return create_token(
        user.id,
        EMAIL_VERIFY_TOKEN_TYPE,
        timedelta(hours=settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS),
        email=user.email,
    )


def create_password_reset_token(user: User) -> str:
    return create_token(
        user.id,
        PASSWORD_RESET_TOKEN_TYPE,
        timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        pwd=password_fingerprint(user.hashed_password),
    )


def _layout(title: str, intro: str, button_label: str, link: str, footnote: str) -> str:
    brand = escape(settings.PROJECT_NAME)
    return f"""\
<!doctype html>
<html lang="tr">
<body style="margin:0;padding:0;background:#0b0e14;font-family:Arial,Helvetica,sans-serif;color:#cbd5e1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#12161f;border:1px solid #1e293b;border-radius:12px;">
        <tr><td style="padding:28px 28px 8px;">
          <div style="font-size:13px;font-weight:bold;letter-spacing:0.08em;color:#60a5fa;text-transform:uppercase;">{brand}</div>
          <h1 style="margin:16px 0 8px;font-size:20px;color:#f1f5f9;">{escape(title)}</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#94a3b8;">{intro}</p>
          <a href="{escape(link, quote=True)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:8px;">{escape(button_label)}</a>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#64748b;">Buton çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>
            <span style="color:#94a3b8;word-break:break-all;">{escape(link)}</span></p>
        </td></tr>
        <tr><td style="padding:20px 28px 28px;">
          <p style="margin:0;padding-top:16px;border-top:1px solid #1e293b;font-size:11px;line-height:1.6;color:#64748b;">{footnote}<br><br>
            {brand} yatırım tavsiyesi vermez; yalnızca belirlenmiş matematiksel kurallara göre bilgi ve bildirim sağlar.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def deliver(to_email: str, subject: str, html: str, link: str) -> None:
    if not _email_service.is_configured:
        # Local development without SMTP: the link is printed so the flow can still be tested
        logger.warning("SMTP not configured. %s link for %s: %s", subject, to_email, link)
        return
    await _email_service.send_email(to_email, subject, html)


# The builders run inside the request (while the ORM object is attached) and return the
# arguments for `deliver`, which runs as a background task after the response is sent.
EmailJob = tuple[str, str, str, str]


def verification_email(user: User) -> EmailJob:
    link = f"{settings.FRONTEND_URL}/eposta-dogrula?token={create_email_verify_token(user)}"
    name = escape(user.first_name or "")
    html = _layout(
        title="E-posta adresinizi doğrulayın",
        intro=f"Merhaba {name}, hesabınızı etkinleştirmek için aşağıdaki butona tıklayın.",
        button_label="E-postamı Doğrula",
        link=link,
        footnote=f"Bu bağlantı {settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS} saat geçerlidir. "
        "Bu kaydı siz yapmadıysanız e-postayı yok sayabilirsiniz.",
    )
    return user.email, "E-posta doğrulama", html, link


def password_reset_email(user: User) -> EmailJob:
    link = f"{settings.FRONTEND_URL}/sifre-sifirla?token={create_password_reset_token(user)}"
    name = escape(user.first_name or "")
    html = _layout(
        title="Şifre sıfırlama",
        intro=f"Merhaba {name}, hesabınız için şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki butona tıklayın.",
        button_label="Yeni Şifre Belirle",
        link=link,
        footnote=f"Bu bağlantı {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} dakika geçerlidir ve yalnızca bir kez kullanılabilir. "
        "Talebi siz yapmadıysanız şifreniz değişmez, bu e-postayı yok sayabilirsiniz.",
    )
    return user.email, "Şifre sıfırlama", html, link


def mark_login(user: User, ip: str) -> None:
    user.last_login_at = datetime.now(timezone.utc)
    user.last_login_ip = ip[:45]
