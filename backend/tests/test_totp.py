import base64

from app.core import totp

# RFC 6238 Appendix B: SHA1 secret "12345678901234567890", 8-digit codes
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode()
RFC_VECTORS = [
    (59, "94287082"),
    (1111111109, "07081804"),
    (1111111111, "14050471"),
    (1234567890, "89005924"),
    (2000000000, "69279037"),
]


def test_rfc6238_vectors():
    for timestamp, expected in RFC_VECTORS:
        assert totp.hotp(RFC_SECRET, totp.current_counter(timestamp), digits=8) == expected


def test_verify_accepts_current_and_adjacent_steps():
    secret = totp.generate_secret()
    now = 1_700_000_000
    counter = totp.current_counter(now)
    assert totp.verify(secret, totp.hotp(secret, counter), now=now) == counter
    assert totp.verify(secret, totp.hotp(secret, counter - 1), now=now) == counter - 1
    assert totp.verify(secret, totp.hotp(secret, counter + 1), now=now) == counter + 1
    assert totp.verify(secret, totp.hotp(secret, counter - 3), now=now) is None


def test_verify_rejects_replay():
    secret = totp.generate_secret()
    now = 1_700_000_000
    counter = totp.current_counter(now)
    code = totp.hotp(secret, counter)
    assert totp.verify(secret, code, last_used_counter=counter, now=now) is None


def test_verify_rejects_malformed_codes():
    secret = totp.generate_secret()
    for code in ("", "12345", "1234567", "abcdef", None):
        assert totp.verify(secret, code) is None


def test_provisioning_uri():
    uri = totp.provisioning_uri("ABC", "admin@example.com", "BIST Tracker")
    assert uri.startswith("otpauth://totp/BIST%20Tracker%3Aadmin%40example.com?")
    assert "secret=ABC" in uri and "issuer=BIST+Tracker" in uri
