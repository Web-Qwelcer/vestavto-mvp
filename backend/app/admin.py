"""
VestAvto MVP - Admin Panel (SQLAdmin)
"""
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from starlette.responses import RedirectResponse
import os

from app.models import Manager, Client, Product, Order, OrderItem, Payment


class AdminAuth(AuthenticationBackend):
    """Simple admin authentication"""
    
    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = form.get("username")
        password = form.get("password")
        
        # Простий пароль для MVP
        admin_user = os.getenv("ADMIN_USER", "admin")
        admin_pass = os.getenv("ADMIN_PASS", "vestavto2026")
        
        if username == admin_user and password == admin_pass:
            request.session.update({"authenticated": True})
            return True
        return False
    
    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True
    
    async def authenticate(self, request: Request) -> bool:
        return request.session.get("authenticated", False)


class ManagerAdmin(ModelView, model=Manager):
    column_list = [Manager.id, Manager.telegram_id, Manager.full_name, Manager.role, Manager.is_active]
    column_searchable_list = [Manager.full_name, Manager.username]
    column_sortable_list = [Manager.id, Manager.created_at]
    form_excluded_columns = [Manager.orders]


class ClientAdmin(ModelView, model=Client):
    column_list = [Client.id, Client.telegram_id, Client.full_name, Client.phone, Client.is_blocked]
    column_searchable_list = [Client.full_name, Client.phone, Client.username]
    column_sortable_list = [Client.id, Client.created_at]
    form_excluded_columns = [Client.orders]


class ProductAdmin(ModelView, model=Product):
    column_list = [Product.id, Product.name, Product.price, Product.category, Product.car_model, Product.is_available]
    column_searchable_list = [Product.name, Product.description]
    column_sortable_list = [Product.id, Product.price, Product.created_at]
    column_filters = [Product.category, Product.car_model, Product.is_available]
    form_excluded_columns = [Product.order_items]


class OrderAdmin(ModelView, model=Order):
    column_list = [
        Order.id, Order.status, Order.total_amount, Order.paid_amount,
        Order.recipient_name, Order.ttn_number, Order.created_at
    ]
    column_searchable_list = [Order.recipient_name, Order.recipient_phone, Order.ttn_number]
    column_sortable_list = [Order.id, Order.created_at, Order.total_amount]
    column_filters = [Order.status, Order.payment_type]
    form_excluded_columns = [Order.items]


class PaymentAdmin(ModelView, model=Payment):
    column_list = [Payment.id, Payment.order_id, Payment.amount, Payment.payment_type, Payment.is_manual, Payment.created_at]
    column_sortable_list = [Payment.id, Payment.created_at]


def setup_admin(app, engine):
    """Setup SQLAdmin"""
    authentication_backend = AdminAuth(secret_key=os.getenv("JWT_SECRET", "admin-secret"))
    
    admin = Admin(
        app,
        engine,
        authentication_backend=authentication_backend,
        title="VestAvto Admin"
    )
    
    admin.add_view(ManagerAdmin)
    admin.add_view(ClientAdmin)
    admin.add_view(ProductAdmin)
    admin.add_view(OrderAdmin)
    admin.add_view(PaymentAdmin)
