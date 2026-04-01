"""
VestAvto MVP - Auth Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models import Client, Manager, UserRole
from app.schemas import TokenResponse, UserInfo
from app.auth import (
    validate_init_data, 
    create_access_token, 
    get_current_user
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/telegram", response_model=TokenResponse)
async def auth_telegram(
    init_data: str,
    session: AsyncSession = Depends(get_session)
):
    """
    Авторизація через Telegram initData.
    Повертає JWT токен.
    """
    # Валідуємо initData — отримуємо (user, bot_mode) або None
    result = validate_init_data(init_data)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Telegram data"
        )
    tg_user, bot_mode = result

    # Клієнтський бот — завжди client role, незалежно від таблиці managers
    if bot_mode == "client":
        db_result = await session.execute(
            select(Client).where(Client.telegram_id == tg_user.id)
        )
        client = db_result.scalar_one_or_none()
        if not client:
            full_name = tg_user.first_name
            if tg_user.last_name:
                full_name += f" {tg_user.last_name}"
            client = Client(
                telegram_id=tg_user.id,
                username=tg_user.username,
                full_name=full_name
            )
            session.add(client)
            await session.flush()
        if client.is_blocked:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is blocked")
        token = create_access_token(client.id, client.telegram_id, UserRole.CLIENT)
        return TokenResponse(access_token=token, role=UserRole.CLIENT, user_id=client.id, bot_mode="client")

    # Менеджерський бот — перевіряємо таблицю managers
    db_result = await session.execute(
        select(Manager).where(Manager.telegram_id == tg_user.id)
    )
    manager = db_result.scalar_one_or_none()

    if manager:
        if not manager.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Manager account is deactivated"
            )
        token = create_access_token(manager.id, manager.telegram_id, manager.role)
        return TokenResponse(access_token=token, role=manager.role, user_id=manager.id, bot_mode="manager")

    # Не менеджер у менеджерському боті — 403
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied"
    )


@router.get("/me", response_model=UserInfo)
async def get_me(current_user: UserInfo = Depends(get_current_user)):
    """Отримати інформацію про поточного користувача"""
    return current_user
