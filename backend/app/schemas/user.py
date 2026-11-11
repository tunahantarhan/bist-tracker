import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def validate_password_strength(v: str) -> str:
    """Shared policy for registration and password reset."""
    if not re.search(r"[A-Za-zÇĞİÖŞÜçğıöşü]", v) or not re.search(r"\d", v):
        raise ValueError("Şifre en az bir harf ve bir rakam içermelidir.")
    return v


class UserBase(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)
    terms_accepted: bool
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_password_strength(v)

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_names(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Ad ve soyad boş bırakılamaz.")
        return v

    @field_validator("terms_accepted")
    @classmethod
    def check_terms(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Sisteme kayıt olmak için yasal uyarıyı kabul etmelisiniz.")
        return v


class UserLogin(UserBase):
    password: str = Field(max_length=128)


class EmailRequest(UserBase):
    """Body for resend-verification and forgot-password."""


class TokenRequest(BaseModel):
    token: str = Field(max_length=2048)


class PasswordResetRequest(BaseModel):
    token: str = Field(max_length=2048)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_password_strength(v)


class MessageResponse(BaseModel):
    message: str


class RegisterResponse(MessageResponse):
    email: EmailStr


class VerifyEmailResponse(MessageResponse):
    # Lets the sign-in form be pre-filled after verification
    email: EmailStr


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    is_active: bool
    is_admin: bool
    is_verified: bool
    totp_enabled: bool
    tier: str
    terms_accepted_at: datetime
    first_name: str | None = None
    last_name: str | None = None


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    first_name: str | None = None
    last_name: str | None = None
    is_admin: bool = False
    # True only for sessions that passed the admin 2FA step
    admin_session: bool = False


class AdminLoginResponse(BaseModel):
    status: Literal["totp_required", "totp_setup_required"]
    mfa_token: str
    # Only present while 2FA is being set up for the first time
    totp_secret: str | None = None
    otpauth_uri: str | None = None


class TotpVerifyRequest(BaseModel):
    mfa_token: str = Field(max_length=2048)
    code: str = Field(pattern=r"^\d{6}$")


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class AdminUserUpdate(BaseModel):
    tier: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
