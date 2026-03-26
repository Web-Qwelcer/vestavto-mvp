"""
VestAvto MVP - Payments Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models import Order, Payment, OrderStatus, PaymentType
from app.schemas import PaymentCreate, PaymentResponse, MonobankWebhook, UserInfo
from app.auth import get_current_user, get_current_manager
from app.services import monobank, novaposhta

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/create", response_model=PaymentResponse)
async def create_payment(
    data: PaymentCreate,
    session: AsyncSession = Depends(get_session),
    user: UserInfo = Depends(get_current_user)
):
    """Створити рахунок для оплати замовлення"""
    # Отримуємо замовлення
    result = await session.execute(
        select(Order).where(Order.id == data.order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Перевіряємо статус
    if order.status not in [OrderStatus.NEW, OrderStatus.PENDING_PAYMENT]:
        raise HTTPException(status_code=400, detail="Order cannot be paid")
    
    # Визначаємо суму
    if data.payment_type == PaymentType.DEPOSIT:
        amount = order.deposit_amount
        description = f"Завдаток за замовлення #{order.id}"
    else:
        amount = order.total_amount - order.paid_amount
        description = f"Оплата замовлення #{order.id}"
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Nothing to pay")
    
    # Створюємо рахунок в Monobank
    invoice = await monobank.create_invoice(amount, order.id, description)
    
    if not invoice:
        raise HTTPException(status_code=500, detail="Failed to create invoice")
    
    # Оновлюємо замовлення
    order.status = OrderStatus.PENDING_PAYMENT
    order.monobank_invoice_id = invoice["invoice_id"]
    
    return PaymentResponse(
        invoice_id=invoice["invoice_id"],
        page_url=invoice["page_url"]
    )


@router.post("/webhook")
async def monobank_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session)
):
    """
    Webhook від Monobank про статус оплати.
    Викликається автоматично після оплати.
    """
    body = await request.body()
    # TODO: Verify signature
    # signature = request.headers.get("X-Sign", "")
    # if not monobank.verify_webhook_signature(body, signature):
    #     raise HTTPException(status_code=400, detail="Invalid signature")
    
    data = await request.json()
    invoice_id = data.get("invoiceId")
    status = data.get("status")
    
    if not invoice_id:
        return {"ok": True}
    
    # Знаходимо замовлення
    result = await session.execute(
        select(Order).where(Order.monobank_invoice_id == invoice_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        return {"ok": True}
    
    if status == "success":
        # Визначаємо тип оплати
        amount = data.get("amount", 0) / 100  # копійки → гривні
        
        # Записуємо платіж
        payment = Payment(
            order_id=order.id,
            amount=amount,
            payment_type=order.payment_type,
            monobank_invoice_id=invoice_id,
            monobank_status=status
        )
        session.add(payment)
        
        # Оновлюємо замовлення
        order.paid_amount += amount
        
        if order.payment_type == PaymentType.DEPOSIT:
            order.status = OrderStatus.DEPOSIT_PAID
        elif order.paid_amount >= order.total_amount:
            order.status = OrderStatus.PAID
            # Створюємо ТТН у фоні
            background_tasks.add_task(create_ttn_for_order, order.id)
        
        await session.commit()
    
    elif status in ["expired", "failure"]:
        order.status = OrderStatus.NEW
        order.monobank_invoice_id = None
        await session.commit()
    
    return {"ok": True}


@router.post("/{order_id}/verify")
async def verify_payment_manually(
    order_id: int,
    amount: float,
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager)
):
    """Підтвердити оплату вручну (менеджер)"""
    result = await session.execute(
        select(Order).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Записуємо платіж
    payment = Payment(
        order_id=order.id,
        amount=amount,
        payment_type=order.payment_type,
        is_manual=True,
        verified_by=manager.id
    )
    session.add(payment)
    
    # Оновлюємо замовлення
    order.paid_amount += amount
    
    if order.payment_type == PaymentType.DEPOSIT and order.paid_amount >= order.deposit_amount:
        order.status = OrderStatus.DEPOSIT_PAID
    elif order.paid_amount >= order.total_amount:
        order.status = OrderStatus.PAID
    
    await session.commit()
    
    return {"ok": True, "new_status": order.status.value}


async def create_ttn_for_order(order_id: int):
    """Фонова задача: створити ТТН після оплати"""
    from app.database import async_session_maker
    
    async with async_session_maker() as session:
        result = await session.execute(
            select(Order).where(Order.id == order_id)
        )
        order = result.scalar_one_or_none()
        
        if not order or order.status != OrderStatus.PAID:
            return
        
        # Визначаємо метод оплати для НП
        # Якщо був завдаток — решта накладеним платежем
        remaining = order.total_amount - order.paid_amount
        payment_method = "Cash" if remaining > 0 else "NonCash"
        
        ttn = await novaposhta.create_ttn(
            recipient_name=order.recipient_name,
            recipient_phone=order.recipient_phone,
            city_ref=order.np_city_ref,
            warehouse_ref=order.np_warehouse_ref,
            description=f"Автозапчастини. Замовлення #{order.id}",
            cost=order.total_amount,
            payment_method=payment_method
        )
        
        if ttn:
            order.ttn_number = ttn["ttn_number"]
            order.ttn_ref = ttn["ttn_ref"]
            order.status = OrderStatus.PROCESSING
            await session.commit()
