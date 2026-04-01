"""
VestAvto MVP - Monobank Service
"""
import os
import base64
import logging
import httpx
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Monobank public key cache ──────────────────────────────────────────────────
_pubkey_cache: Optional[object] = None   # cryptography EllipticCurvePublicKey


async def _get_monobank_pubkey():
    """Fetch and cache Monobank ECDSA public key (DER, base64-encoded)."""
    global _pubkey_cache
    if _pubkey_cache is not None:
        return _pubkey_cache

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.monobank.ua/api/merchant/pubkey",
                headers={"X-Token": MONOBANK_TOKEN},
            )
            resp.raise_for_status()
            key_b64: str = resp.json().get("key", "")

        from cryptography.hazmat.primitives.serialization import load_der_public_key
        der = base64.b64decode(key_b64)
        _pubkey_cache = load_der_public_key(der)
        logger.info("Monobank public key loaded and cached")
        return _pubkey_cache
    except Exception as exc:
        logger.error(f"Failed to fetch Monobank public key: {exc}")
        return None

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


async def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """
    Verify Monobank webhook ECDSA signature.

    Monobank signs the raw request body with its private key (ECDSA, SHA-256).
    The X-Sign header contains the base64-encoded DER signature.
    We verify it against the cached public key fetched from Monobank API.

    Returns True if signature is valid, False otherwise.
    If the public key cannot be fetched (network error) — returns True to avoid
    blocking legitimate webhooks during an outage, but logs a warning.
    """
    if not signature:
        logger.warning("Monobank webhook: missing X-Sign header")
        return False

    pubkey = await _get_monobank_pubkey()
    if pubkey is None:
        # Key fetch failed — fail open with a warning rather than drop all payments
        logger.warning("Monobank webhook: could not fetch public key, skipping signature check")
        return True

    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric.ec import ECDSA
        sig_bytes = base64.b64decode(signature)
        pubkey.verify(sig_bytes, body, ECDSA(hashes.SHA256()))   # type: ignore[arg-type]
        return True
    except Exception as exc:
        logger.warning(f"Monobank webhook: invalid signature — {exc}")
        return False
