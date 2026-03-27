"""
VestAvto MVP - Authentication
Telegram initData validation + JWT tokens
"""
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import parse_qs, unquote

from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Client, Manager, UserRole
from app.schemas import TelegramUser, UserInfo
from app.database import get_session

# Config
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 7  # 7 днів

security = HTTPBearer(auto_error=False)


def _check_init_data_with_token(
    parsed: dict,
    received_hash: str,
    data_check_string: str,
    bot_token: str,
) -> bool:
    """Перевіряє HMAC підпис initData для одного bot_token."""
    if not bot_token:
        return False
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode(),
        digestmod=hashlib.sha256,
    ).digest()
    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(calculated_hash, received_hash)


def validate_init_data(init_data: str) -> Optional[TelegramUser]:
    """
    Валідація Telegram WebApp initData через HMAC-SHA256.
    Перевіряє CLIENT і MANAGER bot токени — валідний будь-який.
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    try:
        parsed = parse_qs(init_data)

        received_hash = parsed.get("hash", [None])[0]
        if not received_hash:
            return None

        params = [f"{k}={v[0]}" for k, v in parsed.items() if k != "hash"]
        params.sort()
        data_check_string = "\n".join(params)

        client_token  = os.getenv("TELEGRAM_CLIENT_BOT_TOKEN", "")
        manager_token = os.getenv("TELEGRAM_MANAGER_BOT_TOKEN", "")

        valid = (
            _check_init_data_with_token(parsed, received_hash, data_check_string, client_token)
            or
            _check_init_data_with_token(parsed, received_hash, data_check_string, manager_token)
        )
        if not valid:
            return None

        # Перевіряємо auth_date (не старіше 24 годин)
        auth_date = int(parsed.get("auth_date", [0])[0])
        if datetime.utcnow().timestamp() - auth_date > 86400:
            return None

        user_data = parsed.get("user", [None])[0]
        if not user_data:
            return None

        user_json = json.loads(unquote(user_data))
        return TelegramUser(
            id=user_json["id"],
            first_name=user_json.get("first_name", ""),
            last_name=user_json.get("last_name"),
            username=user_json.get("username"),
            photo_url=user_json.get("photo_url"),
        )

    except Exception:
        return None


def create_access_token(
    user_id: int, 
    telegram_id: int, 
    role: UserRole
) -> str:
    """Створити JWT токен"""
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "sub": str(user_id),
        "telegram_id": telegram_id,
        "role": role.value,
        "exp": expire
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Декодувати JWT токен"""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session)
) -> UserInfo:
    """Dependency: отримати поточного користувача"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    payload = decode_token(credentials.credentials)
    user_id = int(payload["sub"])
    role = UserRole(payload["role"])
    
    if role == UserRole.CLIENT:
        result = await session.execute(
            select(Client).where(Client.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return UserInfo(
            id=user.id,
            telegram_id=user.telegram_id,
            username=user.username,
            full_name=user.full_name,
            phone=user.phone,
            role=role
        )
    else:
        result = await session.execute(
            select(Manager).where(Manager.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return UserInfo(
            id=user.id,
            telegram_id=user.telegram_id,
            username=user.username,
            full_name=user.full_name,
            phone=user.phone,
            role=user.role
        )


async def get_current_manager(
    current_user: UserInfo = Depends(get_current_user)
) -> UserInfo:
    """Dependency: тільки менеджер/директор"""
    if current_user.role == UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager access required"
        )
    return current_user


async def get_current_director(
    current_user: UserInfo = Depends(get_current_user)
) -> UserInfo:
    """Dependency: тільки директор"""
    if current_user.role != UserRole.DIRECTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Director access required"
        )
    return current_user
