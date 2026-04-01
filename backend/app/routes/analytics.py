"""
VestAvto MVP - Analytics Routes
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_session
from app.schemas import SourcesResponse, SourceStat, UserInfo
from app.auth import get_current_manager

router = APIRouter(prefix="/admin/analytics", tags=["Analytics"])


@router.get("/sources", response_model=SourcesResponse)
async def get_sources(
    session: AsyncSession = Depends(get_session),
    _manager: UserInfo = Depends(get_current_manager),
):
    """Статистика по джерелах трафіку (тільки менеджери)"""
    result = await session.execute(text("""
        SELECT
            COALESCE(c.source, 'direct') AS source,
            COUNT(DISTINCT c.id)         AS clients,
            COUNT(o.id)                  AS orders
        FROM clients c
        LEFT JOIN orders o ON o.client_id = c.id
        GROUP BY COALESCE(c.source, 'direct')
        ORDER BY clients DESC
    """))
    rows = result.fetchall()
    return SourcesResponse(
        sources=[SourceStat(source=r.source, clients=r.clients, orders=r.orders) for r in rows]
    )
