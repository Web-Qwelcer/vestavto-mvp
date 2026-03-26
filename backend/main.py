"""
VestAvto MVP - Main Application
"""
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqladmin import Admin

from app.database import engine, init_db
from app.routes import router
from app.admin import setup_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events"""
    await init_db()
    yield


app = FastAPI(
    title="VestAvto API",
    description="API для Telegram Mini App магазину автозапчастин",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for Telegram Mini App
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://web.telegram.org",
        "https://vestavto-webapp.vercel.app",
        os.getenv("FRONTEND_URL", "http://localhost:5173"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(router, prefix="/api")

# Admin panel (SQLAdmin)
setup_admin(app, engine)


@app.get("/")
async def root():
    return {"status": "ok", "app": "VestAvto API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}



# ── TEMP SEED (removed after seeding) ────────────────────────────────────────
from fastapi import Header, HTTPException as _HTTPException
from sqlalchemy import select as _select
from app.database import async_session_maker as _session_maker
from app.models import Manager as _Manager, UserRole as _UserRole
from app.auth import create_access_token as _create_token

@app.post("/api/seed-manager")
async def seed_manager(x_admin_pass: str = Header(...)):
    expected = os.getenv("ADMIN_PASS", "vestavto2026")
    if x_admin_pass != expected:
        raise _HTTPException(status_code=403, detail="Forbidden")
    async with _session_maker() as session:
        result = await session.execute(_select(_Manager).where(_Manager.telegram_id == 999999999))
        mgr = result.scalar_one_or_none()
        if not mgr:
            mgr = _Manager(telegram_id=999999999, username="seed_manager",
                           full_name="Seed Manager", role=_UserRole.MANAGER, is_active=True)
            session.add(mgr)
            await session.commit()
            await session.refresh(mgr)
        token = _create_token(mgr.id, mgr.telegram_id, mgr.role)
        return {"access_token": token, "manager_id": mgr.id}
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "false").lower() == "true"
    )
