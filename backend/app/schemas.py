"""
VestAvto MVP - Pydantic Schemas
"""
import json
import re
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from app.models import OrderStatus, PaymentType, UserRole, CarModel, Category


# === Auth ===

class TelegramUser(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: int
    bot_mode: str = "client"  # "client" | "manager"


class UserInfo(BaseModel):
    id: int
    telegram_id: int
    username: Optional[str]
    full_name: str
    phone: Optional[str]
    role: UserRole


# === Product ===

class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: float = Field(ge=0, default=0)
    deposit: float = Field(ge=0, default=0)
    category: Category
    car_model: CarModel
    photos: Optional[List[str]] = None
    is_available: bool = True
    is_reserved: bool = False
    is_negotiable: bool = False


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(ge=0, default=None)
    deposit: Optional[float] = Field(ge=0, default=None)
    category: Optional[Category] = None
    car_model: Optional[CarModel] = None
    photos: Optional[List[str]] = None
    is_available: Optional[bool] = None
    is_reserved: Optional[bool] = None
    is_negotiable: Optional[bool] = None


class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    @field_validator('photos', mode='before')
    @classmethod
    def parse_photos_json(cls, v):
        """DB stores photos as JSON string — parse it automatically."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

    class Config:
        from_attributes = True


# === Client ===

class ClientBase(BaseModel):
    full_name: str
    phone: Optional[str] = None


class ClientUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    np_city_ref: Optional[str] = None
    np_city_name: Optional[str] = None
    np_warehouse_ref: Optional[str] = None
    np_warehouse_name: Optional[str] = None


class ClientResponse(BaseModel):
    id: int
    telegram_id: int
    username: Optional[str]
    full_name: str
    phone: Optional[str]
    np_city_name: Optional[str]
    np_warehouse_name: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


# === Order ===

class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = 1


class OrderItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: int
    price: float
    
    class Config:
        from_attributes = True


class OrderCreate(BaseModel):
    items: List[OrderItemCreate]
    payment_type: PaymentType
    recipient_name: str
    recipient_phone: str
    np_city_ref: str
    np_city_name: str
    np_warehouse_ref: str
    np_warehouse_name: str
    source: Optional[str] = None  # Traffic source from current session


class OrderResponse(BaseModel):
    id: int
    status: OrderStatus
    payment_type: PaymentType
    total_amount: float
    deposit_amount: float
    paid_amount: float
    recipient_name: str
    recipient_phone: str
    np_city_name: Optional[str]
    np_warehouse_name: Optional[str]
    ttn_number: Optional[str]
    ttn_status: Optional[str]
    created_at: datetime
    items: List[OrderItemResponse] = []
    
    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderContactUpdate(BaseModel):
    recipient_name: str
    recipient_phone: str

    @field_validator('recipient_phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = re.sub(r'\D', '', v)
        if len(digits) == 12 and digits.startswith('38'):
            digits = digits[2:]
        if not re.fullmatch(r'\d{10}', digits):
            raise ValueError('Невірний номер телефону (має бути 10 цифр)')
        return digits

    @field_validator('recipient_name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        words = [w for w in trimmed.split() if w]
        if len(words) < 2:
            raise ValueError("Введіть ім'я та прізвище (мінімум 2 слова)")
        if not re.fullmatch(r"[\u0400-\u04FFa-zA-Z'\- ]+", trimmed):
            raise ValueError("Ім'я містить недопустимі символи")
        return trimmed


# === Nova Poshta ===

class NPCity(BaseModel):
    ref: str
    name: str


class NPWarehouse(BaseModel):
    ref: str
    name: str
    number: str
    city_ref: str


class NPSearchRequest(BaseModel):
    query: str


# === Monobank ===

class PaymentCreate(BaseModel):
    order_id: int
    payment_type: PaymentType


class PaymentResponse(BaseModel):
    invoice_id: str
    page_url: str


class MonobankWebhook(BaseModel):
    invoiceId: str
    status: str
    amount: Optional[int] = None
    ccy: Optional[int] = None
    createdDate: Optional[str] = None
    modifiedDate: Optional[str] = None


# === Stats ===

class DashboardStats(BaseModel):
    total_orders: int
    new_orders: int
    paid_orders: int
    total_revenue: float
    today_orders: int


# === Analytics ===

class SourceStat(BaseModel):
    source: str
    clients: int
    orders: int


class SourcesResponse(BaseModel):
    sources: List[SourceStat]
