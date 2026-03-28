"""
VestAvto MVP - Products Routes
"""
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.database import get_session
from app.models import Product, Category, CarModel, OrderItem
from app.schemas import ProductCreate, ProductUpdate, ProductResponse, UserInfo
from app.auth import get_current_user, get_current_manager
router = APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=List[ProductResponse])
async def get_products(
    category: Optional[Category] = None,
    car_model: Optional[CarModel] = None,
    available_only: bool = True,
    skip: int = 0,
    limit: int = 50,
    session: AsyncSession = Depends(get_session)
):
    """Отримати список товарів (публічний)"""
    query = select(Product)
    
    conditions = []
    if category:
        conditions.append(Product.category == category)
    if car_model:
        conditions.append(Product.car_model == car_model)
    if available_only:
        conditions.append(Product.is_available == True)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(Product.created_at.desc()).offset(skip).limit(limit)
    
    result = await session.execute(query)
    products = result.scalars().all()
    
    return [ProductResponse.model_validate(p) for p in products]


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Отримати товар за ID"""
    result = await session.execute(
        select(Product).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return ProductResponse.model_validate(product)


@router.post("", response_model=ProductResponse)
async def create_product(
    data: ProductCreate,
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager)
):
    """Створити товар (тільки менеджер)"""
    product = Product(
        name=data.name,
        description=data.description,
        price=data.price,
        deposit=data.deposit,
        category=data.category,
        car_model=data.car_model,
        photos=json.dumps(data.photos) if data.photos else None,
        is_available=data.is_available
    )
    session.add(product)
    await session.flush()
    
    response = ProductResponse.model_validate(product)
    response.photos = data.photos or []
    return response


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager)
):
    """Оновити товар (тільки менеджер)"""
    result = await session.execute(
        select(Product).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    if "photos" in update_data:
        update_data["photos"] = json.dumps(update_data["photos"]) if update_data["photos"] else None
    
    for field, value in update_data.items():
        setattr(product, field, value)
    
    await session.flush()
    
    return ProductResponse.model_validate(product)


@router.delete("/{product_id}")
async def delete_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager)
):
    """Видалити товар (тільки менеджер)"""
    result = await session.execute(
        select(Product).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Перевіряємо чи товар є в замовленнях
    linked = await session.execute(
        select(OrderItem).where(OrderItem.product_id == product_id).limit(1)
    )
    if linked.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Неможливо видалити товар — він є в замовленнях"
        )

    await session.delete(product)
    return {"ok": True}


@router.post("/{product_id}/upload-image", response_model=ProductResponse)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    manager: UserInfo = Depends(get_current_manager),
):
    """Завантажити фото товару в Cloudinary (тільки менеджер)"""
    result = await session.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(status_code=400, detail="Image too large (max 10 MB)")

    try:
        from app.services.cloudinary_service import upload_image
        url = await upload_image(file_bytes, product_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

    # Додаємо URL на початок списку photos
    existing: list = []
    if product.photos:
        try:
            existing = json.loads(product.photos)
        except Exception:
            existing = []

    existing.insert(0, url)
    product.photos = json.dumps(existing)
    await session.commit()

    return ProductResponse.model_validate(product)


@router.get("/categories/list")
async def get_categories():
    """Отримати список категорій"""
    return [
        {"value": c.value, "label": get_category_label(c)} 
        for c in Category
    ]


@router.get("/cars/list")
async def get_car_models():
    """Отримати список авто"""
    return [
        {"value": c.value, "label": get_car_label(c)} 
        for c in CarModel
    ]


def get_category_label(cat: Category) -> str:
    labels = {
        Category.ENGINE: "Двигун і навісне",
        Category.TRANSMISSION: "Трансмісія",
        Category.SUSPENSION: "Ходова частина",
        Category.BODY: "Кузов і оптика",
        Category.INTERIOR: "Салон",
        Category.ELECTRICAL: "Електрика",
        Category.OTHER: "Інше"
    }
    return labels.get(cat, cat.value)


def get_car_label(car: CarModel) -> str:
    labels = {
        CarModel.SUPERB_2_PRE: "Skoda Superb 2 (дорест)",
        CarModel.SUPERB_2_REST: "Skoda Superb 2 (рест)",
        CarModel.PASSAT_B7: "VW Passat B7",
        CarModel.CC: "VW CC",
        CarModel.TOUAREG: "VW Touareg",
        CarModel.TIGUAN: "VW Tiguan",
        CarModel.OTHER: "Інше"
    }
    return labels.get(car, car.value)
