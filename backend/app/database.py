"""
VestAvto MVP - Database Configuration
"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from app.models import Base
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./vestavto.db")
# Render надає postgres://, але asyncpg потребує postgresql+asyncpg://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Для PostgreSQL на production замінити на:
# DATABASE_URL = "postgresql+asyncpg://user:password@localhost/vestavto"

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("DEBUG", "false").lower() == "true",
)

async_session_maker = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)


async def init_db():
    """Створити таблиці + накатити легкі міграції"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Each migration in its own transaction so a failed ALTER (column exists)
    # does not abort subsequent migrations — critical for PostgreSQL.
    migrations = [
        "ALTER TABLE products ADD COLUMN is_negotiable BOOLEAN DEFAULT FALSE",
        "ALTER TABLE products ADD COLUMN is_reserved BOOLEAN DEFAULT FALSE",
        "ALTER TABLE clients ADD COLUMN source VARCHAR(200)",
        "ALTER TABLE orders ADD COLUMN source VARCHAR(200)",
    ]
    for sql in migrations:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(sql))
        except Exception:
            pass  # Column already exists — OK

    # Fill NULLs separately, after ALTER is guaranteed to have run
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE products SET is_reserved = FALSE WHERE is_reserved IS NULL")
            )
    except Exception:
        pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency для FastAPI"""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
