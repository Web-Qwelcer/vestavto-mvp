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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "false").lower() == "true"
    )
