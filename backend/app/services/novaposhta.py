"""
VestAvto MVP - Nova Poshta Service
"""
import os
import logging
from datetime import datetime
import httpx
from typing import Optional, List

logger = logging.getLogger(__name__)

NP_API_URL = "https://api.novaposhta.ua/v2.0/json/"

# ── БАГ 4 FIX: змінні зчитуються через функцію, а не на рівні модуля.
# Раніше при порожніх env vars значення назавжди залишались "".
def _cfg(key: str) -> str:
    return os.getenv(key, "")


async def _call_api(model: str, method: str, properties: dict) -> Optional[dict]:
    """Виклик API Нової Пошти"""
    api_key = _cfg("NOVAPOSHTA_API_KEY")
    if not api_key:
        logger.error("[NP] NOVAPOSHTA_API_KEY is not set — skipping API call")
        return None

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
                return data.get("data", [])
            else:
                logger.error(f"[NP] API Error model={model} method={method}: {data.get('errors')}")
                return None
        except Exception as e:
            logger.exception(f"[NP] Request error model={model} method={method}: {e}")
            return None


async def search_cities(query: str, limit: int = 10) -> List[dict]:
    """Пошук міст"""
    result = await _call_api("Address", "searchSettlements", {
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
    
    result = await _call_api("Address", "getWarehouses", props)
    
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
    weight: float = 1,
    seats_amount: int = 1,
    payment_method: str = "NonCash"  # NonCash = передплата, Cash = накладений платіж
) -> Optional[dict]:
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
        logger.error(f"[NP] Cannot create TTN — missing env vars: {missing}")
        return None

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
    
    # Якщо накладений платіж — додаємо суму
    if payment_method == "Cash":
        properties["BackwardDeliveryData"] = [{
            "PayerType": "Recipient",
            "CargoType": "Money",
            "RedeliveryString": str(int(cost))
        }]
    
    result = await _call_api("InternetDocument", "save", properties)
    
    if result and len(result) > 0:
        ttn = result[0]
        return {
            "ttn_number": ttn.get("IntDocNumber"),
            "ttn_ref": ttn.get("Ref"),
            "cost_on_site": ttn.get("CostOnSite"),
            "estimated_delivery": ttn.get("EstimatedDeliveryDate")
        }
    return None


async def get_ttn_status(ttn_number: str) -> Optional[dict]:
    """Отримати статус ТТН"""
    result = await _call_api("TrackingDocument", "getStatusDocuments", {
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
    result = await _call_api("InternetDocument", "delete", {
        "DocumentRefs": ttn_ref
    })
    return result is not None
