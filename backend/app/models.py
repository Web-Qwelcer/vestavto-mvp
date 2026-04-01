"""
VestAvto MVP - Database Models
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, Float, Boolean, 
    DateTime, ForeignKey, Enum as SQLEnum, Table
)
from sqlalchemy.orm import relationship, DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


# === ENUMS ===

class OrderStatus(str, Enum):
    NEW = "new"
    PENDING_PAYMENT = "pending_payment"
    DEPOSIT_PAID = "deposit_paid"
    PAID = "paid"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class PaymentType(str, Enum):
    DEPOSIT = "deposit"
    FULL = "full"


class UserRole(str, Enum):
    CLIENT = "client"
    MANAGER = "manager"
    DIRECTOR = "director"


class CarModel(str, Enum):
    SUPERB_2_PRE = "superb_2_pre"      # Skoda Superb 2 дорест
    SUPERB_2_REST = "superb_2_rest"    # Skoda Superb 2 рест
    PASSAT_B7 = "passat_b7"            # VW Passat B7
    CC = "cc"                          # VW CC
    TOUAREG = "touareg"                # VW Touareg
    TIGUAN = "tiguan"                  # VW Tiguan
    OTHER = "other"


class Category(str, Enum):
    ENGINE = "engine"                  # Двигун і навісне
    TRANSMISSION = "transmission"      # Трансмісія
    SUSPENSION = "suspension"          # Ходова частина
    BODY = "body"                      # Кузов і оптика
    INTERIOR = "interior"              # Салон
    ELECTRICAL = "electrical"          # Електрика
    OTHER = "other"                    # Інше


# === MODELS ===

class Manager(Base):
    """Менеджери системи"""
    __tablename__ = "managers"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), default=UserRole.MANAGER)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    
    # Relations
    orders: Mapped[List["Order"]] = relationship(back_populates="manager")


class Client(Base):
    """Клієнти магазину"""
    __tablename__ = "clients"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    is_blocked: Mapped[bool] = mapped_column(default=False)
    source: Mapped[Optional[str]] = mapped_column(String(200))  # Traffic source from start_param
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    
    # Nova Poshta
    np_city_ref: Mapped[Optional[str]] = mapped_column(String(100))
    np_city_name: Mapped[Optional[str]] = mapped_column(String(200))
    np_warehouse_ref: Mapped[Optional[str]] = mapped_column(String(100))
    np_warehouse_name: Mapped[Optional[str]] = mapped_column(String(300))
    
    # Relations
    orders: Mapped[List["Order"]] = relationship(back_populates="client")


class Product(Base):
    """Товари (б/у запчастини)"""
    __tablename__ = "products"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300))
    description: Mapped[Optional[str]] = mapped_column(Text)
    price: Mapped[float] = mapped_column(Float)
    deposit: Mapped[float] = mapped_column(Float, default=0)  # Завдаток
    
    category: Mapped[Category] = mapped_column(SQLEnum(Category))
    car_model: Mapped[CarModel] = mapped_column(SQLEnum(CarModel))
    
    # Фото (JSON список URL)
    photos: Mapped[Optional[str]] = mapped_column(Text)  # JSON array of URLs
    
    is_available: Mapped[bool] = mapped_column(default=True)
    is_reserved: Mapped[bool] = mapped_column(default=False)
    is_negotiable: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    order_items: Mapped[List["OrderItem"]] = relationship(back_populates="product")


class Order(Base):
    """Замовлення"""
    __tablename__ = "orders"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Client
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    client: Mapped["Client"] = relationship(back_populates="orders")
    
    # Manager (assigned)
    manager_id: Mapped[Optional[int]] = mapped_column(ForeignKey("managers.id"))
    manager: Mapped[Optional["Manager"]] = relationship(back_populates="orders")
    
    # Status & Payment
    status: Mapped[OrderStatus] = mapped_column(SQLEnum(OrderStatus), default=OrderStatus.NEW)
    payment_type: Mapped[PaymentType] = mapped_column(SQLEnum(PaymentType))
    
    # Amounts
    total_amount: Mapped[float] = mapped_column(Float)
    deposit_amount: Mapped[float] = mapped_column(Float, default=0)
    paid_amount: Mapped[float] = mapped_column(Float, default=0)
    
    # Delivery info
    recipient_name: Mapped[str] = mapped_column(String(200))
    recipient_phone: Mapped[str] = mapped_column(String(20))
    np_city_ref: Mapped[Optional[str]] = mapped_column(String(100))
    np_city_name: Mapped[Optional[str]] = mapped_column(String(200))
    np_warehouse_ref: Mapped[Optional[str]] = mapped_column(String(100))
    np_warehouse_name: Mapped[Optional[str]] = mapped_column(String(300))
    
    # Nova Poshta TTN
    ttn_number: Mapped[Optional[str]] = mapped_column(String(50))
    ttn_ref: Mapped[Optional[str]] = mapped_column(String(100))
    ttn_status: Mapped[Optional[str]] = mapped_column(String(100))
    
    # Traffic source (copied from client at order creation)
    source: Mapped[Optional[str]] = mapped_column(String(200))

    # Monobank
    monobank_invoice_id: Mapped[Optional[str]] = mapped_column(String(100))
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
    paid_at: Mapped[Optional[datetime]] = mapped_column()
    shipped_at: Mapped[Optional[datetime]] = mapped_column()
    delivered_at: Mapped[Optional[datetime]] = mapped_column()
    
    # Relations
    items: Mapped[List["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    """Позиції замовлення"""
    __tablename__ = "order_items"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    
    quantity: Mapped[int] = mapped_column(default=1)
    price: Mapped[float] = mapped_column(Float)  # Ціна на момент замовлення
    
    # Relations
    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship(back_populates="order_items")


class Payment(Base):
    """Історія платежів"""
    __tablename__ = "payments"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    
    amount: Mapped[float] = mapped_column(Float)
    payment_type: Mapped[PaymentType] = mapped_column(SQLEnum(PaymentType))
    
    # Monobank data
    monobank_invoice_id: Mapped[Optional[str]] = mapped_column(String(100))
    monobank_status: Mapped[Optional[str]] = mapped_column(String(50))
    
    # Manual verification (if auto failed)
    is_manual: Mapped[bool] = mapped_column(default=False)
    verified_by: Mapped[Optional[int]] = mapped_column(ForeignKey("managers.id"))
    
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
