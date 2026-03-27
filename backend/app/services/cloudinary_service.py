"""
VestAvto MVP - Cloudinary Image Upload Service
"""
import os
import asyncio
import logging
import cloudinary
import cloudinary.uploader

logger = logging.getLogger(__name__)


def _configure():
    """Налаштовує Cloudinary з env vars при кожному виклику."""
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME", ""),
        api_key=os.getenv("CLOUDINARY_API_KEY", ""),
        api_secret=os.getenv("CLOUDINARY_API_SECRET", ""),
        secure=True,
    )


async def upload_image(file_bytes: bytes, product_id: int) -> str:
    """
    Завантажує фото в Cloudinary і повертає secure_url.
    Cloudinary SDK є синхронним — запускаємо в thread pool.
    Кидає RuntimeError якщо upload не вдався.
    """
    _configure()

    def _upload():
        result = cloudinary.uploader.upload(
            file_bytes,
            folder="vestavto/products",
            public_id=f"product_{product_id}_{os.urandom(4).hex()}",
            overwrite=False,
            resource_type="image",
            transformation=[
                {"width": 1200, "height": 1200, "crop": "limit", "quality": "auto:good"},
            ],
        )
        return result

    try:
        result = await asyncio.to_thread(_upload)
        url: str = result.get("secure_url", "")
        if not url:
            raise RuntimeError(f"Cloudinary returned no secure_url: {result}")
        logger.info(f"[Cloudinary] Uploaded product_id={product_id} → {url}")
        return url
    except Exception as exc:
        logger.exception(f"[Cloudinary] Upload failed for product_id={product_id}: {exc}")
        raise RuntimeError(str(exc)) from exc
