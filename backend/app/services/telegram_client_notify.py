"""
VestAvto MVP - Telegram Client Notifications
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)


async def send_client_notification(telegram_id: int, text: str) -> None:
    """
    Надіслати сповіщення клієнту в Telegram через CLIENT бота.
    Помилки не кидають виключень — сповіщення не повинно ламати основний flow.
    """
    token = os.getenv("TELEGRAM_CLIENT_BOT_TOKEN", "")
    if not token:
        logger.warning("[TG Client] Skipping — TELEGRAM_CLIENT_BOT_TOKEN not set")
        return

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(url, json={
                "chat_id": telegram_id,
                "text": text,
                "parse_mode": "HTML",
            })
            if not resp.json().get("ok"):
                logger.error(
                    f"[TG Client] sendMessage failed for telegram_id={telegram_id}: {resp.text}"
                )
        except Exception as exc:
            logger.exception(f"[TG Client] Request error for telegram_id={telegram_id}: {exc}")
