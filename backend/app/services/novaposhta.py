"""
VestAvto MVP - Nova Poshta Service
"""
import os
import logging
from datetime import datetime
import httpx
from typing import Optional, List, Tuple

logger = logging.getLogger(__name__)

# Імпорт відкладено щоб уникнути циклічних залежностей
async def _notify_error(error: str, context: str) -> None:
    try:
        from app.services.telegram_notify import send_error_notification
        await send_error_notification(error, context)
    except Exception as exc:
        logger.exception(f"[NP] Failed to send error notification: {exc}")

NP_API_URL = "https://api.novaposhta.ua/v2.0/json/"

# ── БАГ 4 FIX: змінні зчитуються через функцію, а не на рівні модуля.
# Раніше при порожніх env vars значення назавжди залишались "".
def _cfg(key: str) -> str:
    return os.getenv(key, "")


async def _call_api(model: str, method: str, properties: dict) -> Tuple[Optional[list], str]:
    """Виклик API Нової Пошти. Повертає (data, error_details)."""
    api_key = _cfg("NOVAPOSHTA_API_KEY")
    if not api_key:
        msg = "NOVAPOSHTA_API_KEY is not set — skipping API call"
        logger.error(f"[NP] {msg}")
        return None, msg

    payload = {
        "apiKey": api_key,
        "modelName": model,
        "calledMethod": method,
        "methodProperties": properties
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(NP_API_URL, json=payload, timeout=30)
            data = response.json()

            if data.get("success"):
                return data.get("data", []), ""
            else:
                errors   = data.get("errors") or []
                warnings = data.get("warnings") or []
                info     = data.get("info") or []
                error_details = (
                    f"errors={errors}"
                    + (f" | warnings={warnings}" if warnings else "")
                    + (f" | info={info}" if info else "")
                )
                logger.error(
                    f"[NP] API Error model={model} method={method} | "
                    f"full_response={data}"
                )
                return None, error_details
        except Exception as e:
            msg = f"Request exception: {e}"
            logger.exception(f"[NP] {msg} model={model} method={method}")
            return None, msg


async def search_cities(query: str, limit: int = 10) -> List[dict]:
    """Пошук міст"""
    result, _ = await _call_api("Address", "searchSettlements", {
        "CityName": query,
        "Limit": str(limit)
    })

    if not result:
        return []
    
    cities = []
    for item in result:
        for addr in item.get("Addresses", []):
            cities.append({
                "ref": addr.get("DeliveryCity"),
                "name": addr.get("Present", addr.get("MainDescription", ""))
            })
    return cities


async def get_warehouses(city_ref: str, search: str = "") -> List[dict]:
    """Отримати відділення міста"""
    props = {
        "CityRef": city_ref,
        "Limit": "50"
    }
    if search:
        props["FindByString"] = search
    
    result, _ = await _call_api("Address", "getWarehouses", props)

    if not result:
        return []
    
    return [
        {
            "ref": w.get("Ref"),
            "name": w.get("Description"),
            "number": w.get("Number"),
            "city_ref": w.get("CityRef")
        }
        for w in result
    ]


async def create_ttn(
    recipient_name: str,
    recipient_phone: str,
    city_ref: str,
    warehouse_ref: str,
    description: str,
    cost: float,
    cash_on_delivery: float = 0,  # сума до стягнення при отриманні (total - paid)
    weight: float = 1,
    seats_amount: int = 1,
    payment_method: str = "NonCash"  # NonCash = передплата, Cash = накладений платіж
) -> Tuple[Optional[dict], str]:
    """
    Створити ТТН.
    payment_method: NonCash (передплата) або Cash (накладений платіж)
    """
    # Розбиваємо ПІБ
    name_parts = recipient_name.strip().split()
    if len(name_parts) >= 2:
        last_name = name_parts[0]
        first_name = name_parts[1]
        middle_name = name_parts[2] if len(name_parts) > 2 else ""
    else:
        last_name = recipient_name
        first_name = ""
        middle_name = ""
    
    # ── БАГ 5 FIX: перевіряємо що всі обов'язкові env vars задані
    sender_ref      = _cfg("NP_SENDER_REF")
    contact_sender  = _cfg("NP_CONTACT_SENDER_REF")
    sender_phone    = _cfg("NP_SENDER_PHONE")
    city_sender_ref = _cfg("NP_CITY_SENDER_REF")
    warehouse_sender= _cfg("NP_WAREHOUSE_SENDER_REF")

    missing = [k for k, v in {
        "NP_SENDER_REF": sender_ref,
        "NP_CONTACT_SENDER_REF": contact_sender,
        "NP_SENDER_PHONE": sender_phone,
        "NP_CITY_SENDER_REF": city_sender_ref,
        "NP_WAREHOUSE_SENDER_REF": warehouse_sender,
    }.items() if not v]
    if missing:
        msg = f"Не задані env vars: {missing}"
        logger.error(f"[NP] Cannot create TTN — {msg}")
        await _notify_error(msg, "Nova Poshta — створення ТТН")
        return None, msg

    # ── БАГ 6 FIX: DateTime: "" → поточна дата у форматі НП "DD.MM.YYYY"
    today = datetime.now().strftime("%d.%m.%Y")

    properties = {
        "PayerType": "Recipient" if payment_method == "Cash" else "Sender",
        "PaymentMethod": payment_method,
        "DateTime": today,
        "CargoType": "Parcel",
        "Weight": str(weight),
        "SeatsAmount": str(seats_amount),
        "Description": description,
        "Cost": str(int(cost)),
        "ServiceType": "WarehouseWarehouse",

        # Відправник
        "CitySender": city_sender_ref,
        "Sender": sender_ref,
        "SenderAddress": warehouse_sender,
        "ContactSender": contact_sender,
        "SendersPhone": sender_phone,

        # Отримувач
        "CityRecipient": city_ref,
        "RecipientAddress": warehouse_ref,
        "RecipientsPhone": recipient_phone,
        "RecipientName": recipient_name,

        # Для нового контрагента
        "NewAddress": "1",
        "RecipientCityName": "",
        "RecipientAddressName": "",
        "RecipientType": "PrivatePerson",
        "FirstName": first_name,
        "LastName": last_name,
        "MiddleName": middle_name,
    }
    
    # Якщо накладений платіж — додаємо точну суму до стягнення:
    # DEPOSIT_PAID → cash_on_delivery = total - deposit (решта після завдатку)
    # PAID         → cash_on_delivery = 0, payment_method = NonCash (не потрапляємо сюди)
    if payment_method == "Cash":
        properties["BackwardDeliveryData"] = [{
            "PayerType": "Recipient",
            "CargoType": "Money",
            "RedeliveryString": str(int(cash_on_delivery))
        }]
    
    result, error_details = await _call_api("InternetDocument", "save", properties)

    if result and len(result) > 0:
        ttn = result[0]
        return {
            "ttn_number": ttn.get("IntDocNumber"),
            "ttn_ref": ttn.get("Ref"),
            "cost_on_site": ttn.get("CostOnSite"),
            "estimated_delivery": ttn.get("EstimatedDeliveryDate")
        }, ""
    return None, error_details


async def get_ttn_status(ttn_number: str) -> Optional[dict]:
    """Отримати статус ТТН"""
    result, _ = await _call_api("TrackingDocument", "getStatusDocuments", {
        "Documents": [{"DocumentNumber": ttn_number}]
    })
    
    if result and len(result) > 0:
        status = result[0]
        return {
            "status": status.get("Status"),
            "status_code": status.get("StatusCode"),
            "warehouse_recipient": status.get("WarehouseRecipient"),
            "actual_delivery_date": status.get("ActualDeliveryDate")
        }
    return None


async def delete_ttn(ttn_ref: str) -> bool:
    """Видалити ТТН (якщо ще не відправлено)"""
    result, _ = await _call_api("InternetDocument", "delete", {
        "DocumentRefs": ttn_ref
    })
    return result is not None
