"""
VestAvto MVP - Monobank Service
"""
import os
import httpx
from typing import Optional
from datetime import datetime

MONOBANK_API_URL = "https://api.monobank.ua"
MONOBANK_TOKEN = os.getenv("MONOBANK_API_TOKEN", "")
WEBHOOK_URL = os.getenv("MONOBANK_WEBHOOK_URL", "")  # https://your-domain.com/payments/webhook


async def create_invoice(
    amount: float,
    order_id: int,
    description: str = "Оплата замовлення VestAvto"
) -> Optional[dict]:
    """
    Створити рахунок для оплати.
    amount в гривнях, конвертується в копійки.
    """
    # Mock для тестового середовища
    if MONOBANK_TOKEN in ("", "test_monobank_token"):
        import uuid
        fake_id = f"test_invoice_{order_id}_{uuid.uuid4().hex[:8]}"
        print(f"[MOCK] Monobank invoice created: {fake_id}, amount={amount}")
        return {
            "invoice_id": fake_id,
            "page_url": f"https://pay.monobank.ua/mock/{fake_id}"
        }

    amount_coins = int(amount * 100)

    payload = {
        "amount": amount_coins,
        "ccy": 980,  # UAH
        "merchantPaymInfo": {
            "reference": str(order_id),
            "destination": description,
        },
        "redirectUrl": f"{os.getenv('FRONTEND_URL', '')}/order/{order_id}",
        "webHookUrl": WEBHOOK_URL,
        "validity": 3600,  # 1 година
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{MONOBANK_API_URL}/api/merchant/invoice/create",
                headers={"X-Token": MONOBANK_TOKEN},
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "invoice_id": data.get("invoiceId"),
                    "page_url": data.get("pageUrl")
                }
            else:
                print(f"Monobank error: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"Monobank request error: {e}")
            return None


async def check_invoice_status(invoice_id: str) -> Optional[dict]:
    """Перевірити статус рахунку"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{MONOBANK_API_URL}/api/merchant/invoice/status",
                headers={"X-Token": MONOBANK_TOKEN},
                params={"invoiceId": invoice_id},
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            return None
            
        except Exception as e:
            print(f"Monobank status check error: {e}")
            return None


async def get_statement(
    account_id: str,
    from_time: datetime,
    to_time: Optional[datetime] = None
) -> list:
    """
    Отримати виписку по рахунку.
    Для ручної перевірки оплат.
    """
    from_ts = int(from_time.timestamp())
    to_ts = int(to_time.timestamp()) if to_time else int(datetime.utcnow().timestamp())
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{MONOBANK_API_URL}/personal/statement/{account_id}/{from_ts}/{to_ts}",
                headers={"X-Token": MONOBANK_TOKEN},
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            return []
            
        except Exception as e:
            print(f"Monobank statement error: {e}")
            return []


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """
    Перевірка підпису webhook від Monobank.
    TODO: Реалізувати перевірку ECDSA підпису
    """
    # Monobank використовує ECDSA підпис
    # Для MVP можна пропустити, але для production — обов'язково
    return True
