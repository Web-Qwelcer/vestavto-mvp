"""
VestAvto MVP - Delivery Routes (Nova Poshta)
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models import Order, OrderStatus
from app.schemas import NPCity, NPWarehouse, NPSearchRequest, UserInfo
from app.auth import get_current_user, get_current_manager
from app.services import novaposhta

router = APIRouter(prefix="/delivery", tags=["Delivery"])


@router.get("/cities", response_model=List[NPCity])
async def search_cities(query: str):
    """Пошук міст НП"""
    if len(query) < 2:
        return []
    
    cities = await novaposhta.search_cities(query)
    return [NPCity(**c) for c in cities]


@router.get("/warehouses", response_model=List[NPWarehouse])
async def get_warehouses(city_ref: str, search: str = ""):
    """Отримати відділення міста"""
    warehouses = await novaposhta.get_warehouses(city_ref, search)
    return [NPWarehouse(**w) for w in warehouses]


@router.post("/{order_id}/create-ttn")
async def create_ttn(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager)
):
    """Створити ТТН вручну (менеджер)"""
    result = await session.execute(
        select(Order).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.ttn_number:
        raise HTTPException(status_code=400, detail="TTN already exists")
    
    # Визначаємо метод оплати
    remaining = order.total_amount - order.paid_amount
    payment_method = "Cash" if remaining > 0 else "NonCash"
    
    ttn = await novaposhta.create_ttn(
        recipient_name=order.recipient_name,
        recipient_phone=order.recipient_phone,
        city_ref=order.np_city_ref,
        warehouse_ref=order.np_warehouse_ref,
        description=f"Автозапчастини. Замовлення #{order.id}",
        cost=order.total_amount,
        cash_on_delivery=remaining,
        payment_method=payment_method
    )
    
    if not ttn:
        raise HTTPException(status_code=500, detail="Failed to create TTN")
    
    order.ttn_number = ttn["ttn_number"]
    order.ttn_ref = ttn["ttn_ref"]
    order.status = OrderStatus.PROCESSING
    
    return ttn


@router.get("/{order_id}/track")
async def track_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserInfo = Depends(get_current_user)
):
    """Трекінг замовлення"""
    result = await session.execute(
        select(Order).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not order.ttn_number:
        return {"status": "no_ttn", "message": "ТТН ще не створено"}
    
    status = await novaposhta.get_ttn_status(order.ttn_number)
    
    if status:
        # Оновлюємо статус в БД
        order.ttn_status = status["status"]
        
        # Автооновлення статусу замовлення
        status_code = status.get("status_code")
        if status_code in ["7", "8"]:  # Прибув / Отримано
            order.status = OrderStatus.DELIVERED
        elif status_code in ["5", "6", "101"]:  # В дорозі
            order.status = OrderStatus.SHIPPED
        
        await session.commit()
    
    return status or {"status": "unknown"}


@router.delete("/{order_id}/ttn")
async def delete_ttn(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager)
):
    """Видалити ТТН (менеджер)"""
    result = await session.execute(
        select(Order).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not order.ttn_ref:
        raise HTTPException(status_code=400, detail="No TTN to delete")
    
    success = await novaposhta.delete_ttn(order.ttn_ref)
    
    if success:
        order.ttn_number = None
        order.ttn_ref = None
        order.ttn_status = None
        return {"ok": True}
    
    raise HTTPException(status_code=500, detail="Failed to delete TTN")
