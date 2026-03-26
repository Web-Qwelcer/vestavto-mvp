"""Routes package"""
from fastapi import APIRouter
from app.routes import auth, products, orders, payments, delivery

router = APIRouter()

router.include_router(auth.router)
router.include_router(products.router)
router.include_router(orders.router)
router.include_router(payments.router)
router.include_router(delivery.router)
