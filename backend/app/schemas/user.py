from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str
    terms_accepted: bool

    @field_validator('terms_accepted')
    @classmethod
    def check_terms(cls, v):
        if not v:
            raise ValueError("Sisteme kayıt olmak için yasal uyarıyı kabul etmelisiniz.")
        return v

class UserLogin(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    email: EmailStr
    is_active: bool
    tier: str
    terms_accepted_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str