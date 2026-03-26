"""
VestAvto MVP - Pydantic Schemas
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
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
    price: float = Field(gt=0)
    deposit: float = Field(ge=0, default=0)
    category: Category
    car_model: CarModel
    photos: Optional[List[str]] = None
    is_available: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(gt=0, default=None)
    deposit: Optional[float] = Field(ge=0, default=None)
    category: Optional[Category] = None
    car_model: Optional[CarModel] = None
    photos: Optional[List[str]] = None
    is_available: Optional[bool] = None


class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
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
