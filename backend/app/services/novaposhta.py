"""
VestAvto MVP - Nova Poshta Service
"""
import os
import httpx
from typing import Optional, List

NP_API_URL = "https://api.novaposhta.ua/v2.0/json/"
NP_API_KEY = os.getenv("NOVAPOSHTA_API_KEY", "")

# Дані відправника
NP_SENDER_REF = os.getenv("NP_SENDER_REF", "")
NP_CONTACT_SENDER_REF = os.getenv("NP_CONTACT_SENDER_REF", "")
NP_SENDER_PHONE = os.getenv("NP_SENDER_PHONE", "")
NP_CITY_SENDER_REF = os.getenv("NP_CITY_SENDER_REF", "")
NP_WAREHOUSE_SENDER_REF = os.getenv("NP_WAREHOUSE_SENDER_REF", "")


async def _call_api(model: str, method: str, properties: dict) -> Optional[dict]:
    """Виклик API Нової Пошти"""
    payload = {
        "apiKey": NP_API_KEY,
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
                print(f"NP API Error: {data.get('errors')}")
                return None
        except Exception as e:
            print(f"NP API request error: {e}")
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
    
    properties = {
        "PayerType": "Recipient" if payment_method == "Cash" else "Sender",
        "PaymentMethod": payment_method,
        "DateTime": "",  # Поточна дата
        "CargoType": "Parcel",
        "Weight": str(weight),
        "SeatsAmount": str(seats_amount),
        "Description": description,
        "Cost": str(int(cost)),
        "ServiceType": "WarehouseWarehouse",
        
        # Відправник
        "CitySender": NP_CITY_SENDER_REF,
        "Sender": NP_SENDER_REF,
        "SenderAddress": NP_WAREHOUSE_SENDER_REF,
        "ContactSender": NP_CONTACT_SENDER_REF,
        "SendersPhone": NP_SENDER_PHONE,
        
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
