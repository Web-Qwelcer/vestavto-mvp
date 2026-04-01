"""
VestAvto MVP - Payments Routes
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models import Order, Payment, OrderStatus, PaymentType, Client
from app.schemas import PaymentCreate, PaymentResponse, MonobankWebhook, UserInfo
from app.auth import get_current_user, get_current_manager
from app.services import monobank, novaposhta
from app.services.telegram_notify import send_manager_notification, send_error_notification
from app.services.telegram_client_notify import send_client_notification

logger = logging.getLogger(__name__)

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
    signature = request.headers.get("X-Sign", "")
    if not await monobank.verify_webhook_signature(body, signature):
        logger.warning(
            f"Monobank webhook: rejected invalid signature "
            f"(ip={request.client.host if request.client else 'unknown'})"
        )
        raise HTTPException(status_code=400, detail="Invalid signature")

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

        logger.info(
            f"[Webhook] SUCCESS invoice={invoice_id} order={order.id} "
            f"amount={amount} payment_type={order.payment_type}"
        )

        try:
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
                background_tasks.add_task(create_ttn_for_order, order.id)
                logger.info(f"[Webhook] Scheduled TTN creation for deposit order={order.id}")
            elif order.paid_amount >= order.total_amount:
                order.status = OrderStatus.PAID
                background_tasks.add_task(create_ttn_for_order, order.id)
                logger.info(f"[Webhook] Scheduled TTN creation for full-paid order={order.id}")

            await session.commit()

            # Сповіщення клієнту — отримуємо telegram_id поки сесія відкрита
            client_result = await session.execute(
                select(Client).where(Client.id == order.client_id)
            )
            client = client_result.scalar_one_or_none()
            if client:
                background_tasks.add_task(
                    send_client_notification,
                    client.telegram_id,
                    f"✅ Оплату отримано! Очікуйте відправлення."
                )

            background_tasks.add_task(
                send_manager_notification,
                f"✅ Замовлення #{order.id} оплачено\n"
                f"👤 {order.recipient_name}\n"
                f"💰 {amount:.0f} грн"
            )
        except Exception as exc:
            logger.exception(f"[Webhook] Error processing payment for order={order.id}: {exc}")
            background_tasks.add_task(
                send_error_notification,
                str(exc),
                f"Webhook оплати — замовлення #{order.id}, invoice={invoice_id}"
            )
    
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

    logger.info(f"[TTN BG] Starting TTN creation for order={order_id}")

    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Order).where(Order.id == order_id)
            )
            order = result.scalar_one_or_none()

            # ── БАГ 2 FIX: раніше пропускало DEPOSIT_PAID замовлення.
            # Тепер дозволяємо обидва статуси.
            if not order:
                logger.warning(f"[TTN BG] Order {order_id} not found")
                return
            if order.status not in (OrderStatus.PAID, OrderStatus.DEPOSIT_PAID):
                logger.warning(
                    f"[TTN BG] Order {order_id} has unexpected status={order.status}, skipping"
                )
                return

            if order.ttn_number:
                logger.info(f"[TTN BG] Order {order_id} already has TTN={order.ttn_number}, skipping")
                return

            # Визначаємо метод оплати для НП:
            # DEPOSIT_PAID → решта накладеним платежем (Cash)
            # PAID         → передплата (NonCash)
            remaining = order.total_amount - order.paid_amount
            payment_method = "Cash" if remaining > 0 else "NonCash"

            logger.info(
                f"[TTN BG] Creating TTN order={order_id} method={payment_method} "
                f"remaining={remaining} city_ref={order.np_city_ref}"
            )

            ttn, np_error = await novaposhta.create_ttn(
                recipient_name=order.recipient_name,
                recipient_phone=order.recipient_phone,
                city_ref=order.np_city_ref,
                warehouse_ref=order.np_warehouse_ref,
                description=f"Автозапчастини. Замовлення #{order_id}",
                cost=order.total_amount,
                cash_on_delivery=remaining,
                payment_method=payment_method
            )

            if ttn:
                order.ttn_number = ttn["ttn_number"]
                order.ttn_ref    = ttn["ttn_ref"]
                order.status     = OrderStatus.PROCESSING
                await session.commit()
                logger.info(f"[TTN BG] TTN created: {ttn['ttn_number']} for order={order_id}")

                # Сповіщення менеджеру
                await send_manager_notification(
                    f"🚚 ТТН створено: {ttn['ttn_number']}\n"
                    f"Замовлення #{order_id}"
                )

                # Сповіщення клієнту
                client_result = await session.execute(
                    select(Client).where(Client.id == order.client_id)
                )
                client = client_result.scalar_one_or_none()
                if client:
                    await send_client_notification(
                        client.telegram_id,
                        f"🚚 Замовлення відправлено. ТТН: {ttn['ttn_number']}"
                    )
            else:
                msg = (
                    f"Nova Poshta не створила ТТН для замовлення #{order_id}."
                    + (f"\n\nВідповідь API: {np_error}" if np_error else "")
                    + "\n\nПеревір env vars: NOVAPOSHTA_API_KEY, NP_SENDER_REF, "
                    "NP_CONTACT_SENDER_REF, NP_SENDER_PHONE, "
                    "NP_CITY_SENDER_REF, NP_WAREHOUSE_SENDER_REF"
                )
                logger.error(f"[TTN BG] {msg}")
                await send_error_notification(msg, f"Автоматичне створення ТТН — замовлення #{order_id}")

    except Exception as exc:
        logger.exception(f"[TTN BG] Unhandled exception for order={order_id}: {exc}")
        await send_error_notification(str(exc), f"Автоматичне створення ТТН — замовлення #{order_id}")
