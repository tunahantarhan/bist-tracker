import pytest
from pydantic import ValidationError

from app.schemas.user import PasswordResetRequest, UserCreate

BASE = {"email": " Ali@Example.com ", "first_name": " Ali ", "last_name": "Veli", "terms_accepted": True}


def test_valid_registration_is_normalized():
    user = UserCreate(**BASE, password="Parola123")
    assert user.email == "ali@example.com" and user.first_name == "Ali"


@pytest.mark.parametrize("password", ["kisa1", "sadeceharf", "12345678"])
def test_weak_passwords_are_rejected(password):
    with pytest.raises(ValidationError):
        UserCreate(**BASE, password=password)


def test_terms_must_be_accepted():
    with pytest.raises(ValidationError):
        UserCreate(**{**BASE, "terms_accepted": False}, password="Parola123")


def test_reset_uses_same_policy():
    with pytest.raises(ValidationError):
        PasswordResetRequest(token="t", password="sadeceharf")
