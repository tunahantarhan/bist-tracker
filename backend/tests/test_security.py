from datetime import timedelta

from app.core import security


def test_password_hash_roundtrip():
    hashed = security.get_password_hash("Parola123")
    assert security.verify_password("Parola123", hashed)
    assert not security.verify_password("parola123", hashed)


def test_verify_password_handles_malformed_hash():
    assert not security.verify_password("x", "not-a-bcrypt-hash")


def test_token_type_is_enforced():
    access, refresh = security.create_session_tokens(7, token_version=2)
    assert security.decode_token(access, security.ACCESS_TOKEN_TYPE)["sub"] == 7
    assert security.decode_token(access, security.REFRESH_TOKEN_TYPE) is None
    assert security.decode_token(refresh, security.ACCESS_TOKEN_TYPE) is None


def test_session_claims():
    access, _ = security.create_session_tokens(7, token_version=3, admin_scope=True)
    claims = security.decode_token(access, security.ACCESS_TOKEN_TYPE)
    assert claims["ver"] == 3 and claims["adm"] is True


def test_expired_and_tampered_tokens_are_rejected():
    expired = security.create_token(1, security.ACCESS_TOKEN_TYPE, timedelta(seconds=-1))
    assert security.decode_token(expired, security.ACCESS_TOKEN_TYPE) is None
    valid = security.create_token(1, security.ACCESS_TOKEN_TYPE, timedelta(minutes=5))
    assert security.decode_token(valid[:-2] + "xx", security.ACCESS_TOKEN_TYPE) is None


def test_password_fingerprint_changes_with_password():
    a = security.get_password_hash("Parola123")
    b = security.get_password_hash("Parola123")
    assert security.password_fingerprint(a) != security.password_fingerprint(b)
    assert security.password_fingerprint(a) == security.password_fingerprint(a)
