"""
VestAvto MVP - Telegram Manager Notifications
"""
import os
import logging
from datetime import datetime
import httpx

logger = logging.getLogger(__name__)


async def send_manager_notification(text: str) -> None:
    """
    Надіслати сповіщення менеджеру(ам) у Telegram.
    TELEGRAM_MANAGER_CHAT_IDS — кома-розділений список chat_id.
    Помилки не кидають виключень — сповіщення не повинно ламати основний flow.
    """
    token = os.getenv("TELEGRAM_MANAGER_BOT_TOKEN", "")
    chat_ids_raw = os.getenv("TELEGRAM_MANAGER_CHAT_IDS", "")

    if not token or not chat_ids_raw:
        logger.warning("[TG] Skipping notification — TELEGRAM_MANAGER_BOT_TOKEN or TELEGRAM_MANAGER_CHAT_IDS not set")
        return

    chat_ids = [cid.strip() for cid in chat_ids_raw.split(",") if cid.strip()]
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    async with httpx.AsyncClient(timeout=10) as client:
        for chat_id in chat_ids:
            try:
                resp = await client.post(url, json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                })
                if not resp.json().get("ok"):
                    logger.error(f"[TG] sendMessage failed for chat_id={chat_id}: {resp.text}")
            except Exception as exc:
                logger.exception(f"[TG] Request error for chat_id={chat_id}: {exc}")


async def send_error_notification(error: str, context: str) -> None:
    """
    Надіслати сповіщення про помилку менеджеру(ам).
    Ніколи не кидає виключень — wrapped у try/except.
    """
    try:
        now = datetime.now().strftime("%d.%m.%Y %H:%M:%S")
        text = (
            f"❌ <b>ПОМИЛКА</b>\n"
            f"📍 Контекст: {context}\n"
            f"💬 {error}\n"
            f"🕐 {now}"
        )
        await send_manager_notification(text)
    except Exception as exc:
        logger.exception(f"[TG] send_error_notification itself failed: {exc}")
