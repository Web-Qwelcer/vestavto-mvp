"""
VestAvto MVP - Orders Routes
"""
import asyncio
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.models import Order, OrderItem, Product, Client, OrderStatus, PaymentType, UserRole
from app.schemas import (
    OrderCreate, OrderResponse, OrderItemResponse,
    OrderStatusUpdate, OrderContactUpdate, UserInfo
)
from app.auth import get_current_user, get_current_manager
from app.services.telegram_notify import send_manager_notification, send_error_notification

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("", response_model=OrderResponse)
async def create_order(
    data: OrderCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    user: UserInfo = Depends(get_current_user)
):
    """Створити замовлення (клієнт)"""
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Only clients can create orders")

    try:
        return await _create_order_inner(data, background_tasks, session, user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"[Orders] Unexpected error creating order for user={user.id}: {exc}")
        background_tasks.add_task(
            _notify_order_error, exc,
            f"Створення замовлення — клієнт #{user.id} ({user.full_name})"
        )
        raise HTTPException(status_code=500, detail="Internal server error")


async def _create_order_inner(
    data: OrderCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession,
    user: UserInfo,
) -> OrderResponse:
    # Збираємо товари
    product_ids = [item.product_id for item in data.items]
    result = await session.execute(
        select(Product).where(Product.id.in_(product_ids))
    )
    products = {p.id: p for p in result.scalars().all()}
    
    # Перевіряємо наявність
    total = 0
    deposit_total = 0
    order_items = []
    
    for item in data.items:
        product = products.get(item.product_id)
        if not product:
            raise HTTPException(
                status_code=404, 
                detail=f"Product {item.product_id} not found"
            )
        if not product.is_available:
            raise HTTPException(
                status_code=400,
                detail=f"Product '{product.name}' is not available"
            )
        
        item_total = product.price * item.quantity
        total += item_total
        deposit_total += product.deposit * item.quantity
        
        order_items.append(OrderItem(
            product_id=product.id,
            quantity=item.quantity,
            price=product.price
        ))
    
    # Визначаємо суму до оплати
    if data.payment_type == PaymentType.DEPOSIT:
        pay_amount = deposit_total
    else:
        pay_amount = total
    
    # Отримуємо source клієнта для копіювання в замовлення
    client_result = await session.execute(select(Client).where(Client.id == user.id))
    client_obj = client_result.scalar_one_or_none()
    client_source = client_obj.source if client_obj else None

    # Створюємо замовлення
    order = Order(
        client_id=user.id,
        status=OrderStatus.NEW,
        payment_type=data.payment_type,
        total_amount=total,
        deposit_amount=deposit_total,
        recipient_name=data.recipient_name,
        recipient_phone=data.recipient_phone,
        np_city_ref=data.np_city_ref,
        np_city_name=data.np_city_name,
        np_warehouse_ref=data.np_warehouse_ref,
        np_warehouse_name=data.np_warehouse_name,
        source=client_source,
    )
    order.items = order_items
    
    session.add(order)
    await session.flush()

    # Позначаємо товари як недоступні
    for item in data.items:
        product = products[item.product_id]
        product.is_available = False

    # Явний commit ДО повернення відповіді.
    # get_session робить commit у cleanup-фазі — після відправки response.
    # Якщо frontend одразу шле POST /payments/create, order ще не в БД → 404.
    await session.commit()

    response = await _order_to_response(order, products)

    items_text = "\n".join(
        f"  • {products[item.product_id].name} x{item.quantity}"
        for item in data.items
    )
    background_tasks.add_task(
        send_manager_notification,
        f"📦 Нове замовлення #{order.id}\n"
        f"👤 {data.recipient_name} {data.recipient_phone}\n"
        f"🛒 {items_text}\n"
        f"💰 {total:.0f} грн"
    )

    background_tasks.add_task(check_payment_timeout, order.id)

    return response


async def check_payment_timeout(order_id: int) -> None:
    """
    Фонова задача: якщо замовлення не оплачено через 30 хв — сповістити менеджера.
    НЕ скасовує замовлення автоматично.
    """
    await asyncio.sleep(30 * 60)  # 30 хвилин

    from app.database import async_session_maker

    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Order).where(Order.id == order_id)
            )
            order = result.scalar_one_or_none()

            if not order:
                logger.warning(f"[Timeout] Order {order_id} not found")
                return

            if order.status in (OrderStatus.NEW, OrderStatus.PENDING_PAYMENT):
                logger.info(f"[Timeout] Order {order_id} unpaid after 30 min, notifying manager")
                await send_manager_notification(
                    f"⚠️ Замовлення #{order_id} не оплачено 30+ хв\n"
                    f"👤 {order.recipient_name}, {order.recipient_phone}"
                )
            else:
                logger.info(
                    f"[Timeout] Order {order_id} already in status={order.status.value}, skipping"
                )
    except Exception as exc:
        logger.exception(f"[Timeout] Error checking order {order_id}: {exc}")


@router.patch("/{order_id}/contact", response_model=OrderResponse)
async def update_order_contact(
    order_id: int,
    data: OrderContactUpdate,
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager)
):
    """Оновити контактні дані замовлення (менеджер). Заблоковано після створення ТТН."""
    result = await session.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.ttn_number:
        raise HTTPException(
            status_code=409,
            detail="Неможливо редагувати — ТТН вже створено (дані передані в Нову Пошту)"
        )

    order.recipient_name = data.recipient_name
    order.recipient_phone = data.recipient_phone

    product_ids = [item.product_id for item in order.items]
    prod_result = await session.execute(
        select(Product).where(Product.id.in_(product_ids))
    )
    products = {p.id: p for p in prod_result.scalars().all()}

    return await _order_to_response(order, products)


async def _notify_order_error(exc: Exception, context: str) -> None:
    """Надіслати сповіщення про помилку не ламаючи flow."""
    try:
        await send_error_notification(str(exc), context)
    except Exception:
        pass


@router.get("", response_model=List[OrderResponse])
async def get_orders(
    status: Optional[OrderStatus] = None,
    session: AsyncSession = Depends(get_session),
    user: UserInfo = Depends(get_current_user)
):
    """
    Отримати замовлення.
    Клієнт бачить свої, менеджер — всі.
    """
    query = select(Order).options(selectinload(Order.items))
    
    if user.role == UserRole.CLIENT:
        query = query.where(Order.client_id == user.id)
    
    if status:
        query = query.where(Order.status == status)
    
    query = query.order_by(Order.created_at.desc())
    
    result = await session.execute(query)
    orders = result.scalars().all()
    
    # Завантажуємо products для items
    product_ids = set()
    for order in orders:
        for item in order.items:
            product_ids.add(item.product_id)
    
    if product_ids:
        result = await session.execute(
            select(Product).where(Product.id.in_(product_ids))
        )
        products = {p.id: p for p in result.scalars().all()}
    else:
        products = {}
    
    return [await _order_to_response(o, products) for o in orders]


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserInfo = Depends(get_current_user)
):
    """Отримати замовлення за ID"""
    result = await session.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Перевірка доступу
    if user.role == UserRole.CLIENT and order.client_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Products
    product_ids = [item.product_id for item in order.items]
    result = await session.execute(
        select(Product).where(Product.id.in_(product_ids))
    )
    products = {p.id: p for p in result.scalars().all()}
    
    return await _order_to_response(order, products)


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager)
):
    """Оновити статус замовлення (менеджер)"""
    result = await session.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Оновлюємо статус
    order.status = data.status
    
    # Встановлюємо timestamps
    if data.status == OrderStatus.PAID:
        order.paid_at = datetime.utcnow()
    elif data.status == OrderStatus.SHIPPED:
        order.shipped_at = datetime.utcnow()
    elif data.status == OrderStatus.DELIVERED:
        order.delivered_at = datetime.utcnow()
    elif data.status == OrderStatus.CANCELLED:
        # Повертаємо товари в наявність
        for item in order.items:
            result = await session.execute(
                select(Product).where(Product.id == item.product_id)
            )
            product = result.scalar_one_or_none()
            if product:
                product.is_available = True
    
    # Призначаємо менеджера якщо ще не призначено
    if not order.manager_id:
        order.manager_id = manager.id
    
    await session.flush()
    
    product_ids = [item.product_id for item in order.items]
    result = await session.execute(
        select(Product).where(Product.id.in_(product_ids))
    )
    products = {p.id: p for p in result.scalars().all()}
    
    return await _order_to_response(order, products)


async def _order_to_response(order: Order, products: dict) -> OrderResponse:
    """Конвертувати Order в OrderResponse"""
    items = []
    for item in order.items:
        product = products.get(item.product_id)
        items.append(OrderItemResponse(
            id=item.id,
            product_id=item.product_id,
            product_name=product.name if product else "Unknown",
            quantity=item.quantity,
            price=item.price
        ))
    
    return OrderResponse(
        id=order.id,
        status=order.status,
        payment_type=order.payment_type,
        total_amount=order.total_amount,
        deposit_amount=order.deposit_amount,
        paid_amount=order.paid_amount,
        recipient_name=order.recipient_name,
        recipient_phone=order.recipient_phone,
        np_city_name=order.np_city_name,
        np_warehouse_name=order.np_warehouse_name,
        ttn_number=order.ttn_number,
        ttn_status=order.ttn_status,
        created_at=order.created_at,
        items=items
    )
