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


def test_profile_update_strips_and_rejects_blank_names():
    from app.schemas.user import ProfileUpdate

    assert ProfileUpdate(first_name="  Deniz ", last_name="Kaya").first_name == "Deniz"
    with pytest.raises(ValidationError):
        ProfileUpdate(first_name="   ", last_name="Kaya")


def test_password_change_enforces_policy_on_new_password_only():
    from app.schemas.user import PasswordChangeRequest

    assert PasswordChangeRequest(current_password="old", new_password="Yeni12345").new_password == "Yeni12345"
    with pytest.raises(ValidationError):
        PasswordChangeRequest(current_password="Old12345", new_password="sadeceharf")
