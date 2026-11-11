"""Time-based one-time passwords (RFC 6238) for admin two-factor authentication.

Implemented with the standard library: HMAC-SHA1 over a 30-second time counter,
dynamically truncated to 6 digits (RFC 4226). Compatible with Google Authenticator,
Microsoft Authenticator, 1Password, Authy etc.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

TIME_STEP_SECONDS = 30
DIGITS = 6
# Accept the previous and next step too, to tolerate clock drift between phone and server
ALLOWED_DRIFT_STEPS = 1


def generate_secret() -> str:
    """160-bit random secret, base32 encoded without padding (as authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _decode_secret(secret: str) -> bytes:
    normalized = secret.strip().replace(" ", "").upper()
    return base64.b32decode(normalized + "=" * (-len(normalized) % 8))


def hotp(secret: str, counter: int, digits: int = DIGITS) -> str:
    digest = hmac.new(_decode_secret(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10**digits)).zfill(digits)


def current_counter(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // TIME_STEP_SECONDS)


def verify(secret: str, code: str, last_used_counter: int | None = None, now: float | None = None) -> int | None:
    """Returns the matched time counter, or None.

    A counter that is not newer than `last_used_counter` is rejected, so an observed
    code cannot be replayed within its validity window.
    """
    code = (code or "").strip().replace(" ", "")
    if len(code) != DIGITS or not code.isdigit():
        return None

    base = current_counter(now)
    for counter in range(base - ALLOWED_DRIFT_STEPS, base + ALLOWED_DRIFT_STEPS + 1):
        if last_used_counter is not None and counter <= last_used_counter:
            continue
        if hmac.compare_digest(hotp(secret, counter), code):
            return counter
    return None


def provisioning_uri(secret: str, account_name: str, issuer: str) -> str:
    """otpauth:// URI rendered as a QR code for authenticator apps."""
    label = quote(f"{issuer}:{account_name}")
    query = urlencode({"secret": secret, "issuer": issuer, "algorithm": "SHA1", "digits": DIGITS, "period": TIME_STEP_SECONDS})
    return f"otpauth://totp/{label}?{query}"
