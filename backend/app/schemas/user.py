from pydantic import BaseModel
from datetime import datetime


class UserBase(BaseModel):
    email: str
    display_name: str | None = None
    photo_url: str | None = None


class UserResponse(UserBase):
    id: str
    firebase_uid: str
    telegram_chat_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AuthVerifyRequest(BaseModel):
    id_token: str


class AuthVerifyResponse(BaseModel):
    user: UserResponse
    message: str = "Authenticated successfully"
